import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ART_STYLES, type ItemType } from "@shared/schema";
import {
  ArrowLeft, Users, MapPin, Package, Film, ChevronDown, ChevronRight,
  Loader2, Sparkles, Eye, Clapperboard, Download, Search,
  Settings, FileText, Trash2, ScanSearch,
} from "lucide-react";

const TYPE_ICONS: Record<string, any> = {
  character: Users,
  location: MapPin,
  prop: Package,
  scene: Film,
};

const TYPE_COLORS: Record<string, string> = {
  character: "text-blue-400",
  location: "text-emerald-400",
  prop: "text-amber-400",
  scene: "text-purple-400",
};

export default function ProjectWorkspace() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<string>("all");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [scanningType, setScanningType] = useState<string | null>(null);
  const [developingId, setDevelopingId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceType, setSourceType] = useState("story");
  const [artStyle, setArtStyle] = useState("cinematic");
  const [provider, setProvider] = useState("google");
  const [apiKey, setApiKey] = useState("");

  const saveTimeout = useRef<any>(null);

  const { data: project, isLoading } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}`);
      return res.json();
    },
  });

  // Sync project data to local state on load
  useEffect(() => {
    if (project) {
      setProjectName(project.name || "");
      setSourceText(project.sourceText || "");
      setSourceType(project.sourceType || "story");
      setArtStyle(project.artStyle || "cinematic");
      setProvider(project.provider || "google");
      setApiKey(project.apiKey || "");
      // Auto-open source if empty
      if (!project.sourceText) setSourceOpen(true);
      if (!project.apiKey) setConfigOpen(true);
    }
  }, [project]);

  // Auto-save debounce
  const autoSave = useCallback((updates: any) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      try {
        await apiRequest("PUT", `/api/projects/${projectId}`, updates);
      } catch (e) { /* silent */ }
    }, 800);
  }, [projectId]);

  // Scan mutation
  const scanMutation = useMutation({
    mutationFn: async (type: string) => {
      setScanningType(type);
      const res = await apiRequest("POST", `/api/projects/${projectId}/scan`, { type });
      return res.json();
    },
    onSuccess: (data, type) => {
      setScanningType(null);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      toast({ title: "Scan Complete", description: `Found ${data.items?.length || 0} ${type}s` });
    },
    onError: (err: any) => {
      setScanningType(null);
      toast({ title: "Scan Failed", description: err.message, variant: "destructive" });
    },
  });

  // Develop mutation
  const developMutation = useMutation({
    mutationFn: async (itemId: number) => {
      setDevelopingId(itemId);
      const res = await apiRequest("POST", `/api/projects/${projectId}/items/${itemId}/develop`);
      return res.json();
    },
    onSuccess: () => {
      setDevelopingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      toast({ title: "Development Complete" });
    },
    onError: (err: any) => {
      setDevelopingId(null);
      toast({ title: "Development Failed", description: err.message, variant: "destructive" });
    },
  });

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
    },
  });

  // Export bible
  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/export-all`);
      return res.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName || "Project"}_Production_Bible.docx`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (err: any) => {
      toast({ title: "Export Failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = project?.items || [];
  const filteredItems = activeTab === "all" ? items : items.filter((i: any) => i.type === activeTab);

  const counts = {
    all: items.length,
    character: items.filter((i: any) => i.type === "character").length,
    location: items.filter((i: any) => i.type === "location").length,
    prop: items.filter((i: any) => i.type === "prop").length,
    scene: items.filter((i: any) => i.type === "scene").length,
  };

  const developedCount = items.filter((i: any) => i.status === "developed").length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              data-testid="button-back"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <img src="./lrap-logo.jpg" alt="LRAP" className="h-8 w-8 rounded object-cover shrink-0 hidden md:block" crossOrigin="anonymous" />

            <div className="flex-1 min-w-0">
              <Input
                data-testid="input-project-name"
                value={projectName}
                onChange={(e) => {
                  setProjectName(e.target.value);
                  autoSave({ name: e.target.value });
                }}
                className="h-7 text-sm font-semibold bg-transparent border-none shadow-none focus-visible:ring-1 px-1"
              />
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">PRODUCTION FORGE v1.0</span>
                <span className="text-[10px] text-muted-foreground hidden sm:inline">•</span>
                <span className="text-[10px] font-mono text-primary">
                  {developedCount}/{items.length} developed
                </span>
              </div>
            </div>

            <Select value={artStyle} onValueChange={(v) => { setArtStyle(v); autoSave({ artStyle: v }); }}>
              <SelectTrigger data-testid="select-art-style" className="w-[140px] md:w-[180px] h-8 text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ART_STYLES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              data-testid="button-export-bible"
              variant="secondary"
              size="sm"
              className="gap-1.5 text-xs shrink-0 hidden sm:flex"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending || developedCount === 0}
            >
              {exportMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export Bible
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* Source Text (collapsible) */}
        <Collapsible open={sourceOpen} onOpenChange={setSourceOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <button
                data-testid="button-toggle-source"
                className="w-full p-4 flex items-center justify-between text-left hover:bg-accent/30 transition-colors rounded-t-lg"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Source Text</span>
                  {sourceText && (
                    <Badge variant="secondary" className="text-[10px]">
                      {sourceText.length.toLocaleString()} chars
                    </Badge>
                  )}
                </div>
                {sourceOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Select value={sourceType} onValueChange={(v) => { setSourceType(v); autoSave({ sourceType: v }); }}>
                    <SelectTrigger data-testid="select-source-type" className="w-[140px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="story">Story / Novel</SelectItem>
                      <SelectItem value="screenplay">Screenplay</SelectItem>
                      <SelectItem value="persona">Persona / Bio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  data-testid="textarea-source"
                  placeholder="Paste your manuscript, screenplay, or source text here..."
                  value={sourceText}
                  onChange={(e) => {
                    setSourceText(e.target.value);
                    autoSave({ sourceText: e.target.value });
                  }}
                  className="min-h-[200px] text-sm font-mono"
                />
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Provider Config (collapsible) */}
        <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <button
                data-testid="button-toggle-config"
                className="w-full p-4 flex items-center justify-between text-left hover:bg-accent/30 transition-colors rounded-t-lg"
              >
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">AI Provider</span>
                  {apiKey && (
                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                      {provider} configured
                    </Badge>
                  )}
                </div>
                {configOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 flex items-center gap-3">
                <Select value={provider} onValueChange={(v) => { setProvider(v); autoSave({ provider: v }); }}>
                  <SelectTrigger data-testid="select-provider" className="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google (Gemini)</SelectItem>
                    <SelectItem value="openai">OpenAI (GPT-4o)</SelectItem>
                    <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  data-testid="input-api-key"
                  type="password"
                  placeholder="API Key..."
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    autoSave({ apiKey: e.target.value });
                  }}
                  className="flex-1 h-8 text-xs font-mono"
                />
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Scan Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <ScanSearch className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Scan Source Text</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(["character", "location", "prop", "scene"] as const).map((type) => {
                const Icon = TYPE_ICONS[type];
                const scanning = scanningType === type;
                return (
                  <Button
                    key={type}
                    data-testid={`button-scan-${type}`}
                    variant="secondary"
                    size="sm"
                    className="gap-2 text-xs"
                    disabled={!!scanningType || !sourceText || !apiKey}
                    onClick={() => scanMutation.mutate(type)}
                  >
                    {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                    Scan {type.charAt(0).toUpperCase() + type.slice(1)}s
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Tab Bar */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto">
            <TabsList className="bg-card border border-border inline-flex w-auto">
              <TabsTrigger data-testid="tab-all" value="all" className="text-xs gap-1">
                All <Badge variant="secondary" className="text-[10px] h-4 px-1">{counts.all}</Badge>
              </TabsTrigger>
              <TabsTrigger data-testid="tab-character" value="character" className="text-xs gap-1">
                <Users className="h-3 w-3" /> <span className="hidden sm:inline">Characters</span> <Badge variant="secondary" className="text-[10px] h-4 px-1">{counts.character}</Badge>
              </TabsTrigger>
              <TabsTrigger data-testid="tab-location" value="location" className="text-xs gap-1">
                <MapPin className="h-3 w-3" /> <span className="hidden sm:inline">Locations</span> <Badge variant="secondary" className="text-[10px] h-4 px-1">{counts.location}</Badge>
              </TabsTrigger>
              <TabsTrigger data-testid="tab-prop" value="prop" className="text-xs gap-1">
                <Package className="h-3 w-3" /> <span className="hidden sm:inline">Props</span> <Badge variant="secondary" className="text-[10px] h-4 px-1">{counts.prop}</Badge>
              </TabsTrigger>
              <TabsTrigger data-testid="tab-scene" value="scene" className="text-xs gap-1">
                <Film className="h-3 w-3" /> <span className="hidden sm:inline">Scenes</span> <Badge variant="secondary" className="text-[10px] h-4 px-1">{counts.scene}</Badge>
              </TabsTrigger>
            </TabsList>
          </div>
        </Tabs>

        {/* Dashboard Grid */}
        {filteredItems.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">No items yet</h3>
              <p className="text-xs text-muted-foreground">
                Paste source text and scan to detect {activeTab === "all" ? "items" : activeTab + "s"}.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredItems.map((item: any) => {
              const Icon = TYPE_ICONS[item.type] || FileText;
              const colorClass = TYPE_COLORS[item.type] || "text-muted-foreground";
              const scanData = JSON.parse(item.scanDataJson || "{}");
              const isDeveloped = item.status === "developed";
              const isDeveloping = developingId === item.id;

              return (
                <Card
                  key={item.id}
                  data-testid={`card-item-${item.id}`}
                  className={`transition-colors hover:border-primary/30 ${isDeveloped ? "card-developed" : ""}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`h-8 w-8 rounded-lg bg-accent flex items-center justify-center shrink-0`}>
                          <Icon className={`h-4 w-4 ${colorClass}`} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold truncate">{item.name}</h4>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant={isDeveloped ? "default" : "secondary"}
                              className={`text-[9px] h-4 px-1 ${isDeveloped ? "bg-primary/20 text-primary border-primary/30" : ""}`}
                            >
                              {isDeveloped ? "DEVELOPED" : "SCANNED"}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground capitalize">{item.type}</span>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => {
                          if (confirm(`Delete ${item.name}?`)) deleteItemMutation.mutate(item.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                      {scanData.briefDescription || scanData.briefSummary || scanData.role || "—"}
                    </p>

                    <div className="flex items-center gap-2">
                      {isDeveloped ? (
                        <Button
                          data-testid={`button-view-${item.id}`}
                          variant="secondary"
                          size="sm"
                          className="flex-1 text-xs gap-1"
                          onClick={() => navigate(`/project/${projectId}/item/${item.id}`)}
                        >
                          <Eye className="h-3 w-3" /> View Profile
                        </Button>
                      ) : (
                        <Button
                          data-testid={`button-develop-${item.id}`}
                          size="sm"
                          className="flex-1 text-xs gap-1"
                          disabled={isDeveloping || !!developingId}
                          onClick={() => developMutation.mutate(item.id)}
                        >
                          {isDeveloping ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          Develop
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-border mt-8 py-4">
        <div className="max-w-7xl mx-auto px-4">
          <PerplexityAttribution />
        </div>
      </footer>
    </div>
  );
}
