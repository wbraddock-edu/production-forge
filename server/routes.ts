import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { ART_STYLES, VISUAL_LAYERS, type ItemType } from "@shared/schema";
import {
  Document, Packer, Paragraph, TextRun, ImageRun,
  BorderStyle, AlignmentType, PageBreak,
} from "docx";

// ── AI Provider Abstraction ──

async function callTextAI(
  provider: string, apiKey: string, systemPrompt: string, userPrompt: string
): Promise<string> {
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} - ${await res.text()}`);
    const data = await res.json();
    return data.content[0].text;
  } else if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 8192,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status} - ${await res.text()}`);
    const data = await res.json();
    return data.choices[0].message.content;
  } else if (provider === "google") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { maxOutputTokens: 16384, responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) throw new Error(`Google AI API error: ${res.status} - ${await res.text()}`);
    const data = await res.json();
    if (!data.candidates?.[0]?.content?.parts?.[0]) {
      throw new Error("Google AI returned empty response — check API key and quota");
    }
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error(`Unknown provider: ${provider}`);
}

async function callImageAI(
  provider: string, apiKey: string, prompt: string, referenceImages?: string[]
): Promise<string> {
  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "dall-e-3", prompt, n: 1, size: "1024x1024", response_format: "b64_json",
      }),
    });
    if (!res.ok) throw new Error(`OpenAI Image API error: ${res.status} - ${await res.text()}`);
    const data = await res.json();
    return data.data[0].b64_json;
  } else if (provider === "google") {
    const parts: any[] = [];
    const hasRefs = referenceImages && referenceImages.length > 0;
    if (hasRefs) {
      parts.push({
        text: `Using these ${referenceImages!.length} reference image(s) as visual anchors for consistency (maintain the EXACT same visual features across all outputs), generate: ${prompt}`,
      });
      for (const refImg of referenceImages!) {
        parts.push({ inlineData: { mimeType: "image/png", data: refImg } });
      }
    } else {
      parts.push({ text: `Generate an image: ${prompt}` });
    }
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
      }
    );
    if (!res.ok) throw new Error(`Google Image API error: ${res.status} - ${await res.text()}`);
    const data = await res.json();
    const responseParts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = responseParts.find((p: any) => p.inlineData);
    if (!imagePart) throw new Error("No image returned from Google AI");
    return imagePart.inlineData.data;
  }
  throw new Error(`Image generation not supported for provider: ${provider}. Use OpenAI or Google.`);
}

// ── Robust JSON parse ──
function parseJsonResponse(raw: string): any {
  let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const fb = s.indexOf("{");
  const fk = s.indexOf("[");
  const start = Math.min(fb !== -1 ? fb : Infinity, fk !== -1 ? fk : Infinity);
  if (start !== Infinity) {
    const lb = s.lastIndexOf("}");
    const lk = s.lastIndexOf("]");
    s = s.substring(start, Math.max(lb, lk) + 1);
  }
  return JSON.parse(s);
}

// ── Scan Prompts ──
const SCAN_PROMPTS: Record<string, string> = {
  character: `You are a literary analysis expert. Identify all named characters in the provided text. For each character, provide:
- name: full name as it appears
- role: narrative role (Protagonist, Antagonist, Deuteragonist, Supporting, Minor, Mentioned)
- briefDescription: 1-2 sentence summary
- estimatedImportance: "major" | "minor" | "background"

Return JSON: { "items": [ { "name", "role", "briefDescription", "estimatedImportance" } ] }
Sort by importance (major first). If this is a persona document, return just that character as major.`,

  location: `You are a literary analysis expert. Identify all locations/settings in the provided text. For each location, provide:
- name: the location name
- role: its narrative function (Primary Setting, Secondary Setting, Transitional, Mentioned)
- briefDescription: 1-2 sentence summary of the place
- estimatedImportance: "major" | "minor" | "background"

Return JSON: { "items": [ { "name", "role", "briefDescription", "estimatedImportance" } ] }
Sort by importance.`,

  prop: `You are a literary analysis expert. Identify all significant props/objects in the provided text. For each prop, provide:
- name: the prop/object name
- type: category (Weapon, Tool, Document, Vehicle, Clothing, Technology, Natural Object, etc.)
- briefDescription: 1-2 sentence summary of the object
- estimatedSignificance: "major" | "minor" | "background"

Return JSON: { "items": [ { "name", "type", "briefDescription", "estimatedSignificance" } ] }
Sort by significance.`,

  scene: `You are a literary analysis expert. Identify all distinct scenes in the provided text. For each scene, provide:
- sceneName: a descriptive name for the scene
- sceneNumber: sequential number
- location: where the scene takes place
- timeOfDay: when it occurs
- charactersPresentList: comma-separated list of characters present
- briefSummary: 1-2 sentence summary of what happens
- estimatedLength: "short" | "medium" | "long"

Return JSON: { "items": [ { "sceneName", "sceneNumber", "location", "timeOfDay", "charactersPresentList", "briefSummary", "estimatedLength" } ] }
Sort by scene number.`,
};

// ── Analyze Prompts ──
function buildAnalyzePrompt(type: ItemType, itemName: string, sourceType: string, crossRefContext?: string): string {
  const base = `You are an expert fiction writing analyst. Analyze the provided text and create a comprehensive ${type} development profile for "${itemName}".
This text is a ${sourceType === "persona" ? "character persona/bio document" : sourceType === "screenplay" ? "screenplay" : "story manuscript"}.
Fill in EVERY field with rich, specific detail. Where text doesn't explicitly state something, make intelligent inferences. For unknown fields, write "[Not enough information — consider developing this area]".`;

  const crossRef = crossRefContext ? `\n\nPRODUCTION CONTEXT — Use these established profiles for consistency:\n${crossRefContext}` : "";

  if (type === "character") {
    return `${base}${crossRef}

For the 5 visual study fields, create detailed AI image generation prompts describing this specific character's exact physical features, clothing, and distinguishing marks.

Return ONLY a JSON object with ALL these string fields:
logline, strength, fatalFlaw, greatestFear, coreDesire, fullName, nickname, age, physicalAppearance, distinctiveFeatures, voiceAndSpeech, clothingStyle, earlyChildhood, adolescence, adulthoodPreStory, wound, lieTheyBelieve, personalityType, dominantTraits, keyContradictions, coreValues, moralCode, defaultEmotionalState, emotionalTriggers, copingMechanisms, defenseMechanisms, want, need, primaryAntagonist, keyObstacles, centralInternalStruggle, ghost, desire, relationshipMap, socialCircle, arcType, arcBreakdown, transformationStatement, vocabularyDiction, favouritePhrases, habitsQuirks, skillsTalents, howTheySeeThemselves, howOthersSee, thematicFunction, associatedMotif, animalArchetype, storyQuestion, ifSucceeds, ifFails, writerNotes, inspirationsReferences, unresolvedQuestions, visualTurnaround, visualExpressions, visualPoseMovement, visualCloseUps, visualColorMaterial`;
  }

  if (type === "location") {
    return `${base}${crossRef}

For the 5 visual study fields, create detailed AI image generation prompts for this specific location.

Return ONLY a JSON object with ALL these string fields:
logline, type, scale, timePeriod, alternateNames, region, terrain, climate, layoutDescription, entryExitPoints, surroundingEnvironment, originFounding, keyHistoricalEvents, currentStateVsOriginal, defaultSounds, smells, lightQuality, temperatureAirQuality, tactileSurfaces, timeOfDayVariations, defaultEmotionalTone, psychologicalEffect, locationLie, whoLivesWorksHere, powerHierarchy, writtenUnwrittenRules, accessControl, storyEventsHere, secrets, builtInDangers, characterConstraints, stateAtOpening, stateAtClimax, stateAtResolution, transformationStatement, thematicRepresentation, recurringMotifs, symbolicObjects, colorWeatherAssociations, characterMirror, keyProps, realWorldReferences, cameraAngleSuggestions, vfxNotes, visualEstablishing, visualArchitectural, visualInterior, visualLighting, visualStorytelling`;
  }

  if (type === "prop") {
    return `${base}${crossRef}

For the 5 visual study fields, create detailed AI image generation prompts for this specific prop.

Return ONLY a JSON object with ALL these string fields:
logline, name, propType, belongsTo, significanceLevel, dimensions, weight, materials, color, condition, distinguishingMarks, tactileQuality, creator, creationPurpose, chainOfOwnership, howItArrivedInStory, practicalUse, howItWorks, limitations, hiddenFunctions, storyEventsItDrives, keyScenesWhereAppears, whoWantsIt, whoFearsIt, emotionalAttachments, soundSignature, smell, temperature, visualPresence, thematicRepresentation, ownerMirror, meaningIfDestroyed, stateAtOpening, stateAtResolution, whatFinalConditionReveals, realWorldReferences, fabricationMaterials, cameraAngles, vfxConsiderations, visualHeroShot, visualScaleContext, visualDetailTexture, visualConditionVariations, visualEnvironmental`;
  }

  // scene
  return `${base}${crossRef}

For the 5 visual study fields, create detailed AI image generation prompts for key visual moments in this scene.

Return ONLY a JSON object with ALL these string fields:
sceneName, sceneNumber, sceneLogline, sceneLocation, timeOfDay, durationEstimate, sceneType, narrativePurpose, audienceLearns, emotionalArc, connectionToPreviousScene, connectionToNextScene, charactersAndObjectives, emotionalStateEntering, emotionalStateExiting, powerDynamics, keyDialogueBeats, saidVsMeant, significantSilences, verbalConflictPoints, physicalMovement, stagingPositions, keyGestures, entrancesExits, shotListDetailed, lightingSetup, colorTemperature, shadowsContrast, ambientSound, soundEffects, musicCues, silenceBeats, practicalEffects, cgiRequirements, greenScreenNeeds, safetyConsiderations, underlyingTension, thematicResonance, foreshadowing, symbolicElements, directorNotes, visualMasterShot, visualDramaticMoment, visualCharacterCoverage, visualDetailInsert, visualLightingStudy`;
}

// ── Build cross-reference context for scenes ──
function buildCrossRefContext(projectId: number): string {
  const parts: string[] = [];

  const characters = storage.getItemsByProjectAndType(projectId, "character").filter(i => i.status === "developed" && i.profileJson);
  if (characters.length > 0) {
    const summaries = characters.map(c => {
      const p = JSON.parse(c.profileJson!);
      return `${c.name} — ${p.physicalAppearance || ""} ${p.clothingStyle || ""} ${p.dominantTraits || ""}`.trim();
    });
    parts.push(`CHARACTERS:\n${summaries.join("\n")}`);
  }

  const locations = storage.getItemsByProjectAndType(projectId, "location").filter(i => i.status === "developed" && i.profileJson);
  if (locations.length > 0) {
    const summaries = locations.map(l => {
      const p = JSON.parse(l.profileJson!);
      return `${l.name} — ${p.logline || ""} ${p.layoutDescription || ""}`.trim();
    });
    parts.push(`LOCATIONS:\n${summaries.join("\n")}`);
  }

  const props = storage.getItemsByProjectAndType(projectId, "prop").filter(i => i.status === "developed" && i.profileJson);
  if (props.length > 0) {
    const summaries = props.map(pr => {
      const p = JSON.parse(pr.profileJson!);
      return `${pr.name} — ${p.logline || ""} ${p.materials || ""} ${p.condition || ""}`.trim();
    });
    parts.push(`PROPS:\n${summaries.join("\n")}`);
  }

  return parts.join("\n\n");
}

// ── DOCX Generation Helpers ──
const sectionHeader = (text: string) =>
  new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, font: "Calibri", color: "1a1a2e" })],
    spacing: { before: 400, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" } },
  });

const fieldParagraph = (label: string, value: string) =>
  new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22, font: "Calibri" }),
      new TextRun({ text: value || "—", size: 22, font: "Calibri" }),
    ],
    spacing: { after: 120 },
  });

function buildItemDocxSection(item: any, profile: any, imageBuffers: Record<string, Buffer>): any[] {
  const children: any[] = [];
  const typeLabel = item.type.charAt(0).toUpperCase() + item.type.slice(1);

  children.push(
    new Paragraph({
      children: [new TextRun({ text: `${typeLabel.toUpperCase()} PROFILE`, bold: true, size: 36, font: "Calibri", color: "1a1a2e" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: item.name, bold: true, size: 32, font: "Calibri", color: "2d6a4f" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  );

  // Images
  if (Object.keys(imageBuffers).length > 0) {
    children.push(sectionHeader("VISUAL STUDY"));
    const layers = VISUAL_LAYERS[item.type as ItemType] || {};
    for (const [key, label] of Object.entries(layers)) {
      const buf = imageBuffers[key];
      if (buf) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: label, bold: true, size: 24, font: "Calibri", color: "2d6a4f" })],
            spacing: { before: 300, after: 150 },
          }),
          new Paragraph({
            children: [new ImageRun({ data: buf, transformation: { width: 500, height: 500 }, type: "png" })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          })
        );
      }
    }
  }

  // Profile fields
  if (profile) {
    for (const [key, val] of Object.entries(profile)) {
      if (typeof val === "string" && !key.startsWith("visual")) {
        const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s: string) => s.toUpperCase());
        children.push(fieldParagraph(label, val));
      }
    }
  }

  return children;
}

// ── Route Registration ──
export async function registerRoutes(httpServer: Server, app: Express) {
  // ── Projects CRUD ──
  app.post("/api/projects", (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      const now = new Date().toISOString();
      const project = storage.createProject({
        name, sourceText: "", sourceType: "story", artStyle: "cinematic",
        provider: "google", apiKey: "", createdAt: now, updatedAt: now,
      });
      return res.json(project);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/projects", (_req: Request, res: Response) => {
    const all = storage.listProjects();
    // Add item counts
    const result = all.map(p => {
      const allItems = storage.getItemsByProject(p.id);
      return {
        ...p,
        itemCounts: {
          character: allItems.filter(i => i.type === "character").length,
          location: allItems.filter(i => i.type === "location").length,
          prop: allItems.filter(i => i.type === "prop").length,
          scene: allItems.filter(i => i.type === "scene").length,
          total: allItems.length,
          developed: allItems.filter(i => i.status === "developed").length,
        },
      };
    });
    return res.json(result);
  });

  app.get("/api/projects/:id", (req: Request, res: Response) => {
    const project = storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: "Project not found" });
    const allItems = storage.getItemsByProject(project.id);
    const refs = storage.getReferenceImagesByProject(project.id);
    return res.json({ ...project, items: allItems, referenceImages: refs });
  });

  app.put("/api/projects/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const updated = storage.updateProject(id, req.body);
    if (!updated) return res.status(404).json({ error: "Project not found" });
    return res.json(updated);
  });

  app.delete("/api/projects/:id", (req: Request, res: Response) => {
    storage.deleteProject(Number(req.params.id));
    return res.json({ ok: true });
  });

  // ── Scan ──
  app.post("/api/projects/:id/scan", async (req: Request, res: Response) => {
    try {
      const project = storage.getProject(Number(req.params.id));
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (!project.sourceText) return res.status(400).json({ error: "No source text — paste your manuscript first" });
      if (!project.apiKey) return res.status(400).json({ error: "No API key configured" });

      const { type } = req.body as { type: string };
      if (!SCAN_PROMPTS[type]) return res.status(400).json({ error: `Invalid type: ${type}` });

      const result = await callTextAI(
        project.provider, project.apiKey,
        SCAN_PROMPTS[type],
        `Here is the ${project.sourceType} text to analyze:\n\n${project.sourceText}`
      );

      const parsed = parseJsonResponse(result);
      const rawItems = parsed.items || (Array.isArray(parsed) ? parsed : [parsed]);

      // Create items in DB
      const created = rawItems.map((raw: any) => {
        const name = raw.name || raw.sceneName || "Unnamed";
        return storage.createItem({
          projectId: project.id,
          type,
          name,
          scanDataJson: JSON.stringify(raw),
          profileJson: null,
          visualImagesJson: null,
          status: "scanned",
          createdAt: new Date().toISOString(),
        });
      });

      return res.json({ items: created });
    } catch (err: any) {
      console.error("Scan error:", err);
      return res.status(422).json({ error: err.message });
    }
  });

  // ── Develop (Analyze) ──
  app.post("/api/projects/:id/items/:itemId/develop", async (req: Request, res: Response) => {
    try {
      const project = storage.getProject(Number(req.params.id));
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (!project.apiKey) return res.status(400).json({ error: "No API key configured" });

      const item = storage.getItem(Number(req.params.itemId));
      if (!item) return res.status(404).json({ error: "Item not found" });

      // Build cross-reference context (especially important for scenes)
      const crossRef = buildCrossRefContext(project.id);
      const systemPrompt = buildAnalyzePrompt(
        item.type as ItemType, item.name, project.sourceType,
        crossRef || undefined
      );

      const result = await callTextAI(
        project.provider, project.apiKey, systemPrompt,
        `Here is the text to analyze for "${item.name}":\n\n${project.sourceText}`
      );

      const profile = parseJsonResponse(result);

      const updated = storage.updateItem(item.id, {
        profileJson: JSON.stringify(profile),
        status: "developed",
      });

      return res.json({ profile, item: updated });
    } catch (err: any) {
      console.error("Develop error:", err);
      return res.status(422).json({ error: err.message });
    }
  });

  // ── Generate Image ──
  app.post("/api/projects/:id/items/:itemId/generate-image", async (req: Request, res: Response) => {
    try {
      const project = storage.getProject(Number(req.params.id));
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (!project.apiKey) return res.status(400).json({ error: "No API key configured" });

      const item = storage.getItem(Number(req.params.itemId));
      if (!item) return res.status(404).json({ error: "Item not found" });

      const { layerKey, prompt } = req.body;
      const style = ART_STYLES.find(s => s.id === project.artStyle)?.prompt || "";
      const styledPrompt = style ? `${style}. ${prompt}` : prompt;

      // Get project reference images
      const refs = storage.getReferenceImagesByProject(project.id);
      const refImages = refs.map(r => r.base64Data);

      // Use google for images if provider is anthropic
      const imageProvider = project.provider === "anthropic" ? "google" : project.provider;
      const base64 = await callImageAI(imageProvider, project.apiKey, styledPrompt, refImages);

      // Update item's visual images
      const existing = item.visualImagesJson ? JSON.parse(item.visualImagesJson) : {};
      existing[layerKey] = base64;
      storage.updateItem(item.id, { visualImagesJson: JSON.stringify(existing) });

      return res.json({ image: base64 });
    } catch (err: any) {
      console.error("Image generation error:", err);
      return res.status(422).json({ error: err.message });
    }
  });

  // ── Export Single Item DOCX ──
  app.post("/api/projects/:id/export/:itemId", async (req: Request, res: Response) => {
    try {
      const item = storage.getItem(Number(req.params.itemId));
      if (!item) return res.status(404).json({ error: "Item not found" });

      const profile = item.profileJson ? JSON.parse(item.profileJson) : null;
      const images = item.visualImagesJson ? JSON.parse(item.visualImagesJson) : {};

      const imageBuffers: Record<string, Buffer> = {};
      for (const [key, b64] of Object.entries(images)) {
        if (b64 && typeof b64 === "string") imageBuffers[key] = Buffer.from(b64, "base64");
      }

      const children = buildItemDocxSection(item, profile, imageBuffers);
      const doc = new Document({ sections: [{ children }] });
      const buffer = await Packer.toBuffer(doc);

      const filename = `${item.name.replace(/[^a-zA-Z0-9]/g, "_")}_${item.type}_Profile.docx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err: any) {
      console.error("Export error:", err);
      return res.status(422).json({ error: err.message });
    }
  });

  // ── Export All — Full Production Bible ──
  app.post("/api/projects/:id/export-all", async (req: Request, res: Response) => {
    try {
      const project = storage.getProject(Number(req.params.id));
      if (!project) return res.status(404).json({ error: "Project not found" });

      const allItems = storage.getItemsByProject(project.id).filter(i => i.status === "developed");
      if (allItems.length === 0) return res.status(400).json({ error: "No developed items to export" });

      const sections: any[] = [];

      // Title page
      sections.push({
        children: [
          new Paragraph({ spacing: { before: 3000 } }),
          new Paragraph({
            children: [new TextRun({ text: "PRODUCTION BIBLE", bold: true, size: 48, font: "Calibri", color: "1a1a2e" })],
            alignment: AlignmentType.CENTER, spacing: { after: 200 },
          }),
          new Paragraph({
            children: [new TextRun({ text: project.name, bold: true, size: 40, font: "Calibri", color: "2d6a4f" })],
            alignment: AlignmentType.CENTER, spacing: { after: 400 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Generated ${new Date().toLocaleDateString()}`, size: 24, font: "Calibri", color: "666666" })],
            alignment: AlignmentType.CENTER, spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "by Little Red Apple Productions", size: 24, font: "Calibri", color: "666666" })],
            alignment: AlignmentType.CENTER,
          }),
        ],
      });

      // Group items by type
      for (const itemType of ["character", "location", "prop", "scene"] as const) {
        const typeItems = allItems.filter(i => i.type === itemType);
        if (typeItems.length === 0) continue;

        for (const item of typeItems) {
          const profile = item.profileJson ? JSON.parse(item.profileJson) : null;
          const images = item.visualImagesJson ? JSON.parse(item.visualImagesJson) : {};
          const imageBuffers: Record<string, Buffer> = {};
          for (const [key, b64] of Object.entries(images)) {
            if (b64 && typeof b64 === "string") imageBuffers[key] = Buffer.from(b64, "base64");
          }
          sections.push({ children: buildItemDocxSection(item, profile, imageBuffers) });
        }
      }

      const doc = new Document({ sections });
      const buffer = await Packer.toBuffer(doc);

      const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_Production_Bible.docx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err: any) {
      console.error("Export-all error:", err);
      return res.status(422).json({ error: err.message });
    }
  });

  // ── Reference Images ──
  app.post("/api/projects/:id/reference-images", (req: Request, res: Response) => {
    try {
      const projectId = Number(req.params.id);
      const { base64Data, filename } = req.body;
      if (!base64Data || !filename) return res.status(400).json({ error: "base64Data and filename required" });
      const img = storage.createReferenceImage({
        projectId, base64Data, filename, createdAt: new Date().toISOString(),
      });
      return res.json(img);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/projects/:id/reference-images/:imgId", (req: Request, res: Response) => {
    storage.deleteReferenceImage(Number(req.params.imgId));
    return res.json({ ok: true });
  });

  // ── Delete single item ──
  app.delete("/api/projects/:id/items/:itemId", (req: Request, res: Response) => {
    storage.deleteItem(Number(req.params.itemId));
    return res.json({ ok: true });
  });
}
