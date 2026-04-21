import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Users ──
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  createdAt: text("created_at").notNull(),
  resetToken: text("reset_token"),
  resetTokenExpiresAt: text("reset_token_expires_at"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type SafeUser = Pick<User, "id" | "email" | "displayName" | "createdAt">;

// ── Projects ──
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sourceText: text("source_text").notNull().default(""),
  sourceType: text("source_type").notNull().default("story"),
  artStyle: text("art_style").notNull().default("cinematic"),
  provider: text("provider").notNull().default("google"),
  apiKey: text("api_key").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// ── Items (characters, locations, props, scenes) ──
export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  type: text("type").notNull(), // character | location | prop | scene
  name: text("name").notNull(),
  scanDataJson: text("scan_data_json").notNull(),
  profileJson: text("profile_json"),
  visualImagesJson: text("visual_images_json"),
  status: text("status").notNull().default("scanned"),
  createdAt: text("created_at").notNull(),
});

export const insertItemSchema = createInsertSchema(items).omit({ id: true });
export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof items.$inferSelect;

// ── Reference Images ──
export const referenceImages = sqliteTable("reference_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  base64Data: text("base64_data").notNull(),
  filename: text("filename").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertReferenceImageSchema = createInsertSchema(referenceImages).omit({ id: true });
export type InsertReferenceImage = z.infer<typeof insertReferenceImageSchema>;
export type ReferenceImage = typeof referenceImages.$inferSelect;

// ── Item type enum ──
export type ItemType = "character" | "location" | "prop" | "scene";

// ── Art Styles (STRICT STYLE LOCK) ──
export const ART_STYLES = [
  { id: "cinematic", name: "Cinematic Concept Art", prompt: "STRICT STYLE LOCK: cinematic concept art. Every panel MUST use the same semi-realistic digital painting style with dramatic cinematic lighting, visible brushwork, rich color grading, and film-production quality. Do NOT switch to photorealistic rendering or flat illustration for any panel. Maintain this exact rendering approach regardless of subject matter — close-ups, full body, and environments all use the same painterly cinematic look" },
  { id: "photorealistic", name: "Photorealistic", prompt: "STRICT STYLE LOCK: photorealistic. Every panel MUST look like a real photograph — hyperrealistic skin textures, real-world lighting, studio photography quality, shallow depth of field, 8K detail. Do NOT switch to illustrated, painted, or stylized rendering for any panel. Turnarounds, expressions, poses, and close-ups must ALL look like real photographs of the same person" },
  { id: "pixar", name: "Pixar / 3D Animation", prompt: "STRICT STYLE LOCK: Pixar 3D animation style. Every panel MUST look like a Pixar/Disney 3D rendered frame — smooth subsurface scattering skin, soft rounded features, slightly exaggerated proportions, warm global illumination. Do NOT mix in photorealistic or 2D styles. All panels must look like they came from the same animated film" },
  { id: "anime", name: "Anime / Manga", prompt: "STRICT STYLE LOCK: anime art style. Every panel MUST use consistent anime/manga rendering — clean sharp linework, cel-shaded flat coloring with subtle gradients, large expressive eyes, Japanese animation production quality. Do NOT switch to realistic or Western illustration style for any panel. Turnarounds, close-ups, and scenes all use the same anime look" },
  { id: "3d-render", name: "3D Render / Game Art", prompt: "STRICT STYLE LOCK: 3D game character render. Every panel MUST look like Unreal Engine 5 real-time rendering — PBR materials, subsurface scattering, volumetric lighting, AAA game quality. Do NOT switch to 2D illustration or painterly styles. All panels look like in-engine screenshots from the same game" },
  { id: "2d-illustration", name: "2D Illustration", prompt: "STRICT STYLE LOCK: 2D digital illustration. Every panel MUST use clean vector-like linework with flat color and subtle cel-shading — modern character design sheet aesthetic, graphic novel quality. Do NOT switch to photorealistic or 3D rendering for any panel. Close-ups, full body, and environments all use the same flat illustrated look" },
  { id: "comic-book", name: "Comic Book", prompt: "STRICT STYLE LOCK: comic book art. Every panel MUST use bold ink outlines, dynamic hatching and crosshatching, vivid saturated colors, comic book panel composition. Do NOT switch to photorealistic or soft painted styles. All panels look like pages from the same comic book" },
  { id: "watercolor", name: "Watercolor", prompt: "STRICT STYLE LOCK: watercolor painting. Every panel MUST show loose expressive brushwork, visible paper texture, soft color bleeds and washes, luminous transparent layers. Do NOT switch to digital, photorealistic, or hard-edged styles. All panels look like paintings from the same watercolor artist" },
  { id: "oil-painting", name: "Oil Painting", prompt: "STRICT STYLE LOCK: classical oil painting. Every panel MUST show rich impasto brushwork, chiaroscuro lighting, warm glazing layers, canvas texture visible, Renaissance-quality portraiture. Do NOT switch to digital, photorealistic photography, or flat illustration. All panels look like paintings in the same classical tradition" },
  { id: "concept-art", name: "Concept Art / Matte", prompt: "STRICT STYLE LOCK: entertainment concept art. Every panel MUST use painterly digital style with visible brushstrokes, atmospheric perspective, matte painting quality, loose but intentional rendering. Do NOT switch to tight photorealistic or flat 2D styles. All panels look like production paintings from the same concept artist" },
] as const;

export type ArtStyleId = typeof ART_STYLES[number]["id"];

// ── Visual layer names per item type ──
export const VISUAL_LAYERS: Record<ItemType, Record<string, string>> = {
  character: {
    turnaround: "Turnaround — Foundation",
    expressions: "Expression Sheet — Soul",
    poseMovement: "Pose & Movement — Behavior",
    closeUps: "Close-Up Details — Precision",
    colorMaterial: "Color & Material — Identity",
  },
  location: {
    establishing: "Establishing Shot",
    architectural: "Architectural Detail",
    interior: "Interior View",
    lighting: "Lighting Study",
    storytelling: "Storytelling Moment",
  },
  prop: {
    heroShot: "Hero Shot",
    scaleContext: "Scale & Context",
    detailTexture: "Detail & Texture",
    conditionVariations: "Condition Variations",
    environmental: "Environmental Placement",
  },
  scene: {
    masterShot: "Master Shot",
    dramaticMoment: "Dramatic Moment",
    characterCoverage: "Character Coverage",
    detailInsert: "Detail Insert",
    lightingStudy: "Lighting Study",
  },
};

// ── Profile section configs per type (for display) ──
export const PROFILE_SECTIONS: Record<ItemType, { title: string; fields: { key: string; label: string }[] }[]> = {
  character: [
    { title: "At a Glance", fields: [
      { key: "logline", label: "Logline" }, { key: "strength", label: "Strength" }, { key: "fatalFlaw", label: "Fatal Flaw" }, { key: "greatestFear", label: "Greatest Fear" }, { key: "coreDesire", label: "Core Desire" },
    ]},
    { title: "Identity & Biography", fields: [
      { key: "fullName", label: "Full Name" }, { key: "nickname", label: "Nickname" }, { key: "age", label: "Age" }, { key: "physicalAppearance", label: "Physical Appearance" }, { key: "distinctiveFeatures", label: "Distinctive Features" }, { key: "voiceAndSpeech", label: "Voice & Speech" }, { key: "clothingStyle", label: "Clothing Style" }, { key: "earlyChildhood", label: "Early Childhood" }, { key: "adolescence", label: "Adolescence" }, { key: "adulthoodPreStory", label: "Adulthood Pre-Story" }, { key: "wound", label: "The Wound" }, { key: "lieTheyBelieve", label: "Lie They Believe" },
    ]},
    { title: "Psychology & Inner Life", fields: [
      { key: "personalityType", label: "Personality Type" }, { key: "dominantTraits", label: "Dominant Traits" }, { key: "keyContradictions", label: "Key Contradictions" }, { key: "coreValues", label: "Core Values" }, { key: "moralCode", label: "Moral Code" }, { key: "defaultEmotionalState", label: "Default Emotional State" }, { key: "emotionalTriggers", label: "Emotional Triggers" }, { key: "copingMechanisms", label: "Coping Mechanisms" }, { key: "defenseMechanisms", label: "Defense Mechanisms" },
    ]},
    { title: "Goals & Conflict", fields: [
      { key: "want", label: "Want" }, { key: "need", label: "Need" }, { key: "primaryAntagonist", label: "Primary Antagonist" }, { key: "keyObstacles", label: "Key Obstacles" }, { key: "centralInternalStruggle", label: "Central Internal Struggle" }, { key: "ghost", label: "Ghost" }, { key: "desire", label: "Desire" },
    ]},
    { title: "Relationships", fields: [
      { key: "relationshipMap", label: "Relationship Map" }, { key: "socialCircle", label: "Social Circle" },
    ]},
    { title: "Character Arc", fields: [
      { key: "arcType", label: "Arc Type" }, { key: "arcBreakdown", label: "Arc Breakdown" }, { key: "transformationStatement", label: "Transformation Statement" },
    ]},
    { title: "Voice & Habits", fields: [
      { key: "vocabularyDiction", label: "Vocabulary & Diction" }, { key: "favouritePhrases", label: "Favourite Phrases" }, { key: "habitsQuirks", label: "Habits & Quirks" }, { key: "skillsTalents", label: "Skills & Talents" }, { key: "howTheySeeThemselves", label: "How They See Themselves" }, { key: "howOthersSee", label: "How Others See Them" },
    ]},
    { title: "Theme & Symbolism", fields: [
      { key: "thematicFunction", label: "Thematic Function" }, { key: "associatedMotif", label: "Associated Motif" }, { key: "animalArchetype", label: "Animal Archetype" }, { key: "storyQuestion", label: "Story Question" }, { key: "ifSucceeds", label: "If They Succeed" }, { key: "ifFails", label: "If They Fail" },
    ]},
    { title: "Writer Notes", fields: [
      { key: "writerNotes", label: "Writer's Notes" }, { key: "inspirationsReferences", label: "Inspirations & References" }, { key: "unresolvedQuestions", label: "Unresolved Questions" },
    ]},
  ],
  location: [
    { title: "At a Glance", fields: [
      { key: "logline", label: "Logline" }, { key: "type", label: "Type" }, { key: "scale", label: "Scale" }, { key: "timePeriod", label: "Time Period" }, { key: "alternateNames", label: "Alternate Names" },
    ]},
    { title: "Geography & Environment", fields: [
      { key: "region", label: "Region" }, { key: "terrain", label: "Terrain" }, { key: "climate", label: "Climate" }, { key: "layoutDescription", label: "Layout" }, { key: "entryExitPoints", label: "Entry/Exit Points" }, { key: "surroundingEnvironment", label: "Surrounding Environment" },
    ]},
    { title: "History", fields: [
      { key: "originFounding", label: "Origin/Founding" }, { key: "keyHistoricalEvents", label: "Key Historical Events" }, { key: "currentStateVsOriginal", label: "Current vs Original" },
    ]},
    { title: "Sensory Profile", fields: [
      { key: "defaultSounds", label: "Sounds" }, { key: "smells", label: "Smells" }, { key: "lightQuality", label: "Light Quality" }, { key: "temperatureAirQuality", label: "Temperature/Air" }, { key: "tactileSurfaces", label: "Tactile Surfaces" }, { key: "timeOfDayVariations", label: "Time of Day Variations" },
    ]},
    { title: "Mood & Psychology", fields: [
      { key: "defaultEmotionalTone", label: "Emotional Tone" }, { key: "psychologicalEffect", label: "Psychological Effect" }, { key: "locationLie", label: "Location's Lie" },
    ]},
    { title: "Inhabitants & Rules", fields: [
      { key: "whoLivesWorksHere", label: "Inhabitants" }, { key: "powerHierarchy", label: "Power Hierarchy" }, { key: "writtenUnwrittenRules", label: "Rules" }, { key: "accessControl", label: "Access Control" },
    ]},
    { title: "Story Function", fields: [
      { key: "storyEventsHere", label: "Story Events" }, { key: "secrets", label: "Secrets" }, { key: "builtInDangers", label: "Dangers" }, { key: "characterConstraints", label: "Character Constraints" }, { key: "stateAtOpening", label: "State at Opening" }, { key: "stateAtClimax", label: "State at Climax" }, { key: "stateAtResolution", label: "State at Resolution" }, { key: "transformationStatement", label: "Transformation" },
    ]},
    { title: "Theme & Symbolism", fields: [
      { key: "thematicRepresentation", label: "Thematic Representation" }, { key: "recurringMotifs", label: "Recurring Motifs" }, { key: "symbolicObjects", label: "Symbolic Objects" }, { key: "colorWeatherAssociations", label: "Color/Weather Associations" }, { key: "characterMirror", label: "Character Mirror" },
    ]},
    { title: "Production Notes", fields: [
      { key: "keyProps", label: "Key Props" }, { key: "realWorldReferences", label: "Real-World References" }, { key: "cameraAngleSuggestions", label: "Camera Angles" }, { key: "vfxNotes", label: "VFX Notes" },
    ]},
  ],
  prop: [
    { title: "At a Glance", fields: [
      { key: "logline", label: "Logline" }, { key: "name", label: "Name" }, { key: "propType", label: "Prop Type" }, { key: "belongsTo", label: "Belongs To" }, { key: "significanceLevel", label: "Significance" },
    ]},
    { title: "Physical Properties", fields: [
      { key: "dimensions", label: "Dimensions" }, { key: "weight", label: "Weight" }, { key: "materials", label: "Materials" }, { key: "color", label: "Color" }, { key: "condition", label: "Condition" }, { key: "distinguishingMarks", label: "Distinguishing Marks" }, { key: "tactileQuality", label: "Tactile Quality" },
    ]},
    { title: "History & Origin", fields: [
      { key: "creator", label: "Creator" }, { key: "creationPurpose", label: "Creation Purpose" }, { key: "chainOfOwnership", label: "Chain of Ownership" }, { key: "howItArrivedInStory", label: "How It Arrived" },
    ]},
    { title: "Function", fields: [
      { key: "practicalUse", label: "Practical Use" }, { key: "howItWorks", label: "How It Works" }, { key: "limitations", label: "Limitations" }, { key: "hiddenFunctions", label: "Hidden Functions" },
    ]},
    { title: "Story Role", fields: [
      { key: "storyEventsItDrives", label: "Story Events" }, { key: "keyScenesWhereAppears", label: "Key Scenes" }, { key: "whoWantsIt", label: "Who Wants It" }, { key: "whoFearsIt", label: "Who Fears It" }, { key: "emotionalAttachments", label: "Emotional Attachments" },
    ]},
    { title: "Sensory", fields: [
      { key: "soundSignature", label: "Sound" }, { key: "smell", label: "Smell" }, { key: "temperature", label: "Temperature" }, { key: "visualPresence", label: "Visual Presence" },
    ]},
    { title: "Theme & Symbolism", fields: [
      { key: "thematicRepresentation", label: "Thematic Representation" }, { key: "ownerMirror", label: "Owner Mirror" }, { key: "meaningIfDestroyed", label: "Meaning If Destroyed" }, { key: "stateAtOpening", label: "State at Opening" }, { key: "stateAtResolution", label: "State at Resolution" }, { key: "whatFinalConditionReveals", label: "What Final Condition Reveals" },
    ]},
    { title: "Production Notes", fields: [
      { key: "realWorldReferences", label: "Real-World References" }, { key: "fabricationMaterials", label: "Fabrication Materials" }, { key: "cameraAngles", label: "Camera Angles" }, { key: "vfxConsiderations", label: "VFX Considerations" },
    ]},
  ],
  scene: [
    { title: "Scene Overview", fields: [
      { key: "sceneName", label: "Scene Name" }, { key: "sceneNumber", label: "Scene Number" }, { key: "sceneLogline", label: "Logline" }, { key: "sceneLocation", label: "Location" }, { key: "timeOfDay", label: "Time of Day" }, { key: "durationEstimate", label: "Duration" }, { key: "sceneType", label: "Scene Type" },
    ]},
    { title: "Narrative Purpose", fields: [
      { key: "narrativePurpose", label: "Purpose" }, { key: "audienceLearns", label: "Audience Learns" }, { key: "emotionalArc", label: "Emotional Arc" }, { key: "connectionToPreviousScene", label: "Connection to Previous" }, { key: "connectionToNextScene", label: "Connection to Next" },
    ]},
    { title: "Characters & Dynamics", fields: [
      { key: "charactersAndObjectives", label: "Characters & Objectives" }, { key: "emotionalStateEntering", label: "Emotional State Entering" }, { key: "emotionalStateExiting", label: "Emotional State Exiting" }, { key: "powerDynamics", label: "Power Dynamics" },
    ]},
    { title: "Dialogue", fields: [
      { key: "keyDialogueBeats", label: "Key Dialogue Beats" }, { key: "saidVsMeant", label: "Said vs Meant" }, { key: "significantSilences", label: "Significant Silences" }, { key: "verbalConflictPoints", label: "Verbal Conflict Points" },
    ]},
    { title: "Blocking & Movement", fields: [
      { key: "physicalMovement", label: "Physical Movement" }, { key: "stagingPositions", label: "Staging Positions" }, { key: "keyGestures", label: "Key Gestures" }, { key: "entrancesExits", label: "Entrances & Exits" },
    ]},
    { title: "Visual & Audio", fields: [
      { key: "shotListDetailed", label: "Shot List" }, { key: "lightingSetup", label: "Lighting Setup" }, { key: "colorTemperature", label: "Color Temperature" }, { key: "shadowsContrast", label: "Shadows & Contrast" }, { key: "ambientSound", label: "Ambient Sound" }, { key: "soundEffects", label: "Sound Effects" }, { key: "musicCues", label: "Music Cues" }, { key: "silenceBeats", label: "Silence Beats" },
    ]},
    { title: "Production", fields: [
      { key: "practicalEffects", label: "Practical Effects" }, { key: "cgiRequirements", label: "CGI Requirements" }, { key: "greenScreenNeeds", label: "Green Screen" }, { key: "safetyConsiderations", label: "Safety" },
    ]},
    { title: "Theme & Subtext", fields: [
      { key: "underlyingTension", label: "Underlying Tension" }, { key: "thematicResonance", label: "Thematic Resonance" }, { key: "foreshadowing", label: "Foreshadowing" }, { key: "symbolicElements", label: "Symbolic Elements" }, { key: "directorNotes", label: "Director's Notes" },
    ]},
  ],
};
