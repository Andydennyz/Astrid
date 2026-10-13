import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { User, Building2, Mail, Save } from "lucide-react";

export default function ProfileTab() {
  const user = useQuery(api.settings.getCurrentUser, {});
  const updateProfile = useMutation(api.settings.updateProfile);

  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Derive display values: local state takes priority, fallback to DB
  const displayName = name ?? user?.name ?? "";
  const displayEmail = email ?? user?.email ?? "";
  const displayCompany = companyName ?? user?.companyName ?? "";

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        name: name ?? undefined,
        email: email ?? undefined,
        companyName: companyName ?? undefined,
      });
      toast.success("Profile updated successfully");
      // Reset local state so future edits start from DB values
      setName(null);
      setEmail(null);
      setCompanyName(null);
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (user === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <User size={17} className="text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Personal Information</CardTitle>
              <CardDescription className="text-xs">Update your name and contact details</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Full Name</Label>
            <Input
              value={displayName}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Mail size={12} /> Email Address
            </Label>
            <Input
              value={displayEmail}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@gmail.com"
              type="email"
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Building2 size={12} /> Company / ISP Name
            </Label>
            <Input
              value={displayCompany}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="My ISP Ltd."
              className="bg-background border-border"
            />
          </div>

          <div className="pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2"
            >
              <Save size={13} />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account info (read-only) */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Account Details</CardTitle>
          <CardDescription className="text-xs">Read-only system information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "Role", value: user?.role ?? "operator" },
            { label: "Token ID", value: user?.tokenIdentifier?.slice(0, 40) + "…" },
          ].map((row) => (
            <div key={row.label} className="flex justify-between items-center py-2 border-b border-border/40 last:border-0">
              <span className="text-xs text-muted-foreground">{row.label}</span>
              <span className="text-xs font-mono text-foreground">{row.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
