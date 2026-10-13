import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { User, CheckCircle } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

interface Props {
  user: { name?: string; email?: string; companyName?: string };
  isDone: boolean;
  onComplete: () => void;
}

export default function StepProfile({ user, isDone, onComplete }: Props) {
  const [saving, setSaving] = useState(false);
  const completeProfile = useMutation(api.onboarding.completeProfileStep);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user.name ?? "",
      email: user.email ?? "",
      companyName: user.companyName ?? "",
    },
  });

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      await completeProfile({
        name: data.name,
        companyName: data.companyName,
        email: data.email || undefined,
      });
      toast.success("Profile saved!");
      onComplete();
    } catch {
      toast.error("Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={isDone ? "border-green-500/30" : ""}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${isDone ? "border-green-500/30 bg-green-500/10" : "border-primary/30 bg-primary/10"}`}>
            {isDone ? <CheckCircle size={20} className="text-green-400" /> : <User size={20} className="text-primary" />}
          </div>
          <div>
            <CardTitle className="text-base">Company Profile</CardTitle>
            <CardDescription>Tell us about your ISP so we can personalise your portal</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <Label htmlFor="name">Your Full Name</Label>
            <Input id="name" placeholder="John Smith" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="companyName">ISP / Company Name</Label>
            <Input id="companyName" placeholder="Acme Internet Services" {...register("companyName")} />
            {errors.companyName && <p className="text-xs text-destructive">{errors.companyName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Business Email <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="email" type="email" placeholder="admin@acme-isp.com" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? "Saving..." : isDone ? "Update Profile" : "Save & Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
