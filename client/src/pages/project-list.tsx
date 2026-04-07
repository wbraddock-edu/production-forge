import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Folder, Users, MapPin, Package, Film,
  Trash2, Loader2, Clapperboard,
  FileText, Box, BookOpen, Mic, Video, Camera,
} from "lucide-react";
import productionForgeLogo from "@assets/production-forge-logo.png";

export default function ProjectList() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: projects = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/projects", { name });
      return res.json();
    },
    onSuccess: (project: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setDialogOpen(false);
      setNewName("");
      navigate(`/project/${project.id}`);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/projects"] }),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <img
            src={productionForgeLogo}
            alt="Production Forge"
            className="h-10 w-10 rounded-md object-cover"
          />
          <div className="flex-1">
            <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <Clapperboard className="h-5 w-5 text-primary" />
              PRODUCTION FORGE
              <span className="text-xs font-mono text-muted-foreground">v1.0</span>
            </h1>
            <p className="text-xs text-muted-foreground">by Little Red Apple Productions</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-semibold">Projects</h2>
            <p className="text-sm text-muted-foreground">
              {projects.length} project{projects.length !== 1 ? "s" : ""}
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-project" className="gap-2">
                <Plus className="h-4 w-4" /> New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newName.trim()) createMutation.mutate(newName.trim());
                }}
                className="space-y-4"
              >
                <Input
                  data-testid="input-project-name"
                  placeholder="Project name..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
                <Button
                  data-testid="button-create-project"
                  type="submit"
                  disabled={!newName.trim() || createMutation.isPending}
                  className="w-full"
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Create Project
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Folder className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No projects yet</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Create your first project to start building a production bible.
              </p>
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> New Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p: any) => (
              <Card
                key={p.id}
                data-testid={`card-project-${p.id}`}
                className="cursor-pointer hover:border-primary/40 transition-colors group"
                onClick={() => navigate(`/project/${p.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Clapperboard className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{p.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      data-testid={`button-delete-project-${p.id}`}
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this project and all its items?")) {
                          deleteMutation.mutate(p.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {p.itemCounts && (
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" /> {p.itemCounts.character}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {p.itemCounts.location}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Package className="h-3 w-3" /> {p.itemCounts.prop}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Film className="h-3 w-3" /> {p.itemCounts.scene}
                      </div>
                    </div>
                  )}

                  {p.itemCounts && p.itemCounts.total > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{p.itemCounts.developed} of {p.itemCounts.total} developed</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(p.itemCounts.developed / p.itemCounts.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Cross-Promotion: The Forge Suite */}
      <div className="max-w-6xl mx-auto px-6 mt-12">
        <h2 className="text-sm font-mono font-semibold tracking-wider uppercase mb-2 text-muted-foreground">
          The Forge Suite
        </h2>
        <p className="text-xs text-muted-foreground/70 mb-4">
          Production Forge is part of a complete AI production toolkit by Little Red Apple Productions.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { name: "Character Forge", url: "https://character.littleredappleproductions.com", icon: Users, desc: "AI-powered character development with multi-panel portrait studies and 11 art styles." },
            { name: "Location Forge", url: "https://location.littleredappleproductions.com", icon: MapPin, desc: "AI-powered location scouting and environment visualization for film production." },
            { name: "Manuscript Forge", url: "https://manuscript.littleredappleproductions.com", icon: FileText, desc: "Production readiness analysis for screenplays — story structure, character arcs, pacing, and dialogue." },
            { name: "Props Forge", url: "https://props.littleredappleproductions.com", icon: Box, desc: "AI-powered prop identification and visual development from manuscript analysis." },
            { name: "Scene Forge", url: "https://scene.littleredappleproductions.com", icon: Clapperboard, desc: "Scene breakdown and shot lists with 10-section profiles — lighting, sound, VFX, and emotional mapping." },
            { name: "Story Forge", url: "https://github.com/wbraddock-edu/story-forge", icon: BookOpen, desc: "AI-assisted story development and screenplay writing with structured narrative tools." },
            { name: "Sound Forge", url: "https://github.com/wbraddock-edu/sound-forge", icon: Mic, desc: "AI-powered sound design — dialogue, ambience, foley, music cues, and scene sound profiles." },
            { name: "Prompt Cinematographer", url: "https://github.com/wbraddock-edu/prompt-cinematographer", icon: Camera, desc: "Shot translation engine — converts cinematography language into AI video platform prompts." },
          ].map((mod) => (
            <a
              key={mod.name}
              href={mod.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg p-4 bg-card border border-border hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <mod.icon className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">{mod.name}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {mod.desc}
              </p>
            </a>
          ))}
        </div>
      </div>

      <footer className="border-t border-border mt-12 py-4">
        <div className="max-w-6xl mx-auto px-6">
          <PerplexityAttribution />
        </div>
      </footer>
    </div>
  );
}
