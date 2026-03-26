import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
          <h1 className="text-lg font-bold mb-2">404 — Page Not Found</h1>
          <p className="text-sm text-muted-foreground mb-4">
            This page doesn't exist.
          </p>
          <Button onClick={() => navigate("/")} variant="secondary">
            Back to Projects
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
