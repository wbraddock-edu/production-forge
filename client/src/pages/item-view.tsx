import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VISUAL_LAYERS, PROFILE_SECTIONS, ART_STYLES, type ItemType } from "@shared/schema";
import {
  ArrowLeft, Loader2, Download, Image, Sparkles,
  Copy, Check, Upload, X, Clapperboard, RefreshCw,
} from "lucide-react";

export default function ItemView() {
  const params = useParams<{ id: string; itemId: string }>();
  const projectId = Number(params.id);
  const itemId = Number(params.itemId);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [activeProfileTab, setActiveProfileTab] = useState("0");
  const [generatingLayer, setGeneratingLayer] = useState<string | null>(null);
  const [midjourneyDialog, setMidjourneyDialog] = useState<{ open: boolean; prompt: string }>({ open: false, prompt: "" });
  const [copied, setCopied] = useState(false);
  const [refUploadOpen, setRefUploadOpen] = useState(false);

  // Fetch project + item
  const { data: project } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}`);
      return res.json();
    },
  });

  const item = project?.items?.find((i: any) => i.id === itemId);
  const profile = item?.profileJson ? JSON.parse(item.profileJson) : null;
  const visualImages = item?.visualImagesJson ? JSON.parse(item.visualImagesJson) : {};
  const itemType = (item?.type || "character") as ItemType;
  const layers = VISUAL_LAYERS[itemType] || {};
  const sections = PROFILE_SECTIONS[itemType] || [];
  const referenceImages = project?.referenceImages || [];

  // Generate image mutation
  const generateMutation = useMutation({
    mutationFn: async ({ layerKey, prompt }: { layerKey: string; prompt: string }) => {
      setGeneratingLayer(layerKey);
      const res = await apiRequest("POST", `/api/projects/${projectId}/items/${itemId}/generate-image`, {
        layerKey,
        prompt,
      });
      return res.json();
    },
    onSuccess: () => {
      setGeneratingLayer(null);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      toast({ title: "Image Generated" });
    },
    onError: (err: any) => {
      setGeneratingLayer(null);
      toast({ title: "Generation Failed", description: err.message, variant: "destructive" });
    },
  });

  // Export single item DOCX
  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/export/${itemId}`);
      return res.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item?.name || "Item"}_Profile.docx`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (err: any) => {
      toast({ title: "Export Failed", description: err.message, variant: "destructive" });
    },
  });

  // Upload reference image
  const uploadRefMutation = useMutation({
    mutationFn: async ({ base64Data, filename }: { base64Data: string; filename: string }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/reference-images`, { base64Data, filename });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      toast({ title: "Reference Image Uploaded" });
    },
  });

  const deleteRefMutation = useMutation({
    mutationFn: async (imgId: number) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/reference-images/${imgId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
    },
  });

  // Re-develop mutation
  const developMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/items/${itemId}/develop`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      toast({ title: "Re-developed Successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadRefMutation.mutate({ base64Data: base64, filename: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function getVisualPromptKey(layerKey: string): string {
    // Map layer keys to visual prompt field names in the profile
    const map: Record<string, Record<string, string>> = {
      character: { turnaround: "visualTurnaround", expressions: "visualExpressions", poseMovement: "visualPoseMovement", closeUps: "visualCloseUps", colorMaterial: "visualColorMaterial" },
      location: { establishing: "visualEstablishing", architectural: "visualArchitectural", interior: "visualInterior", lighting: "visualLighting", storytelling: "visualStorytelling" },
      prop: { heroShot: "visualHeroShot", scaleContext: "visualScaleContext", detailTexture: "visualDetailTexture", conditionVariations: "visualConditionVariations", environmental: "visualEnvironmental" },
      scene: { masterShot: "visualMasterShot", dramaticMoment: "visualDramaticMoment", characterCoverage: "visualCharacterCoverage", detailInsert: "visualDetailInsert", lightingStudy: "visualLightingStudy" },
    };
    return map[itemType]?.[layerKey] || "";
  }

  function downloadImage(base64: string, name: string) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            data-testid="button-back-to-dashboard"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => navigate(`/project/${projectId}`)}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold truncate">{item.name}</h1>
              <Badge variant="secondary" className="text-[9px] capitalize">{item.type}</Badge>
              <Badge
                variant={item.status === "developed" ? "default" : "secondary"}
                className={`text-[9px] ${item.status === "developed" ? "bg-primary/20 text-primary" : ""}`}
              >
                {item.status.toUpperCase()}
              </Badge>
            </div>
          </div>

          <Button
            data-testid="button-redevelop"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => developMutation.mutate()}
            disabled={developMutation.isPending}
          >
            {developMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Re-develop
          </Button>

          <Button
            data-testid="button-export-item"
            variant="secondary"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            {exportMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            Export DOCX
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT: Profile */}
          <div>
            <Card className="h-[calc(100vh-140px)]">
              <div className="p-3 border-b border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Profile Data</h3>
              </div>
              {profile && sections.length > 0 ? (
                <Tabs value={activeProfileTab} onValueChange={setActiveProfileTab} className="h-[calc(100%-48px)] flex flex-col">
                  <div className="px-3 pt-2">
                    <TabsList className="bg-card border border-border flex-wrap h-auto gap-1">
                      {sections.map((sec, idx) => (
                        <TabsTrigger
                          key={idx}
                          value={String(idx)}
                          className="text-[10px] h-6 px-2"
                        >
                          {sec.title}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                  {sections.map((sec, idx) => (
                    <TabsContent key={idx} value={String(idx)} className="flex-1 overflow-hidden m-0 px-3 pb-3">
                      <ScrollArea className="h-full pr-3">
                        <div className="space-y-3 py-2">
                          {sec.fields.map((f) => {
                            const val = profile[f.key];
                            if (!val) return null;
                            return (
                              <div key={f.key} className="space-y-0.5">
                                <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">{f.label}</span>
                                <p className="text-xs leading-relaxed text-foreground/90">{val}</p>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  No profile data. Click "Re-develop" to generate.
                </div>
              )}
            </Card>
          </div>

          {/* RIGHT: Visual Study */}
          <div className="space-y-3">
            {/* Reference Images */}
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Reference Images ({referenceImages.length})
                  </span>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                    <Button data-testid="button-upload-ref" variant="ghost" size="sm" className="gap-1 text-xs h-6" asChild>
                      <span><Upload className="h-3 w-3" /> Upload</span>
                    </Button>
                  </label>
                </div>
                {referenceImages.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {referenceImages.map((ref: any) => (
                      <div key={ref.id} className="relative shrink-0 group">
                        <img
                          src={`data:image/png;base64,${ref.base64Data}`}
                          alt={ref.filename}
                          className="h-14 w-14 rounded object-cover border border-border"
                        />
                        <button
                          className="absolute -top-1 -right-1 h-4 w-4 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteRefMutation.mutate(ref.id)}
                        >
                          <X className="h-2.5 w-2.5 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Visual Study Grid */}
            <Card>
              <div className="p-3 border-b border-border flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visual Study</h3>
                {profile && (
                  <Button
                    data-testid="button-generate-all-images"
                    size="sm"
                    variant="secondary"
                    className="gap-1 text-xs h-6"
                    disabled={!!generatingLayer}
                    onClick={async () => {
                      for (const layerKey of Object.keys(layers)) {
                        if (visualImages[layerKey]) continue;
                        const promptKey = getVisualPromptKey(layerKey);
                        const prompt = profile[promptKey];
                        if (prompt) {
                          try {
                            setGeneratingLayer(layerKey);
                            await apiRequest("POST", `/api/projects/${projectId}/items/${itemId}/generate-image`, { layerKey, prompt });
                            await queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
                          } catch (e: any) {
                            toast({ title: `Failed: ${layerKey}`, description: e.message, variant: "destructive" });
                          }
                        }
                      }
                      setGeneratingLayer(null);
                      toast({ title: "All images generated" });
                    }}
                  >
                    <Sparkles className="h-3 w-3" /> Generate All
                  </Button>
                )}
              </div>
              <CardContent className="p-3">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(layers).map(([key, label]) => {
                    const img = visualImages[key];
                    const isGenerating = generatingLayer === key;
                    const promptKey = getVisualPromptKey(key);
                    const prompt = profile?.[promptKey] || "";

                    return (
                      <div
                        key={key}
                        data-testid={`visual-panel-${key}`}
                        className="relative aspect-square rounded-lg border border-border bg-accent/30 overflow-hidden group"
                      >
                        {img ? (
                          <>
                            <img
                              src={`data:image/png;base64,${img}`}
                              alt={label}
                              className="w-full h-full object-cover"
                            />
                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-white hover:text-primary"
                                onClick={() => downloadImage(img, `${item.name}_${key}`)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-white hover:text-primary"
                                onClick={() => {
                                  setMidjourneyDialog({ open: true, prompt });
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-white hover:text-primary"
                                disabled={isGenerating}
                                onClick={() => {
                                  if (prompt) generateMutation.mutate({ layerKey: key, prompt });
                                }}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full p-3 text-center">
                            {isGenerating ? (
                              <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
                            ) : (
                              <Image className="h-6 w-6 text-muted-foreground mb-2" />
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-[10px] h-6"
                              disabled={!prompt || isGenerating || !!generatingLayer}
                              onClick={() => {
                                if (prompt) generateMutation.mutate({ layerKey: key, prompt });
                              }}
                            >
                              {isGenerating ? "Generating..." : "Generate"}
                            </Button>
                          </div>
                        )}
                        {/* Label overlay */}
                        <div className="absolute bottom-0 left-0 right-0 visual-label-overlay px-2 py-1.5">
                          <span className="text-[10px] font-medium text-white/90">{label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Midjourney Copy Dialog */}
      <Dialog open={midjourneyDialog.open} onOpenChange={(open) => setMidjourneyDialog({ ...midjourneyDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy Prompt</DialogTitle>
          </DialogHeader>
          <Textarea
            value={midjourneyDialog.prompt}
            readOnly
            className="min-h-[150px] text-xs font-mono"
          />
          <Button
            className="w-full gap-2"
            onClick={() => {
              navigator.clipboard.writeText(midjourneyDialog.prompt);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied!" : "Copy to Clipboard"}
          </Button>
        </DialogContent>
      </Dialog>

      <footer className="border-t border-border mt-4 py-4">
        <div className="max-w-7xl mx-auto px-4">
          <PerplexityAttribution />
        </div>
      </footer>
    </div>
  );
}
