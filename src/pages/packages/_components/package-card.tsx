import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Download, Upload, Users, MoreHorizontal, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";

type Package = {
  _id: Id<"packages">;
  name: string;
  speed: string;
  price: number;
  type: "pppoe" | "hotspot" | "static";
  description?: string;
  isActive: boolean;
  downloadSpeed: number;
  uploadSpeed: number;
  subscriberCount: number;
  createdAt: string;
};

type Props = {
  pkg: Package;
  onEdit: (id: Id<"packages">) => void;
};

const typeColors: Record<string, string> = {
  pppoe: "bg-cyan-400/10 text-cyan-400 border-cyan-400/30",
  hotspot: "bg-amber-400/10 text-amber-400 border-amber-400/30",
  static: "bg-blue-400/10 text-blue-400 border-blue-400/30",
};

const typeLabels: Record<string, string> = {
  pppoe: "PPPoE",
  hotspot: "Hotspot",
  static: "Static",
};

export default function PackageCard({ pkg, onEdit }: Props) {
  const toggleActive = useMutation(api.packages.toggleActive);
  const removeMutation = useMutation(api.packages.remove);

  const handleToggle = async () => {
    try {
      await toggleActive({ id: pkg._id, isActive: !pkg.isActive });
      toast.success(`Package ${pkg.isActive ? "deactivated" : "activated"}`);
    } catch {
      toast.error("Failed to update package status");
    }
  };

  const handleDelete = async () => {
    try {
      await removeMutation({ id: pkg._id });
      toast.success("Package deleted");
    } catch {
      toast.error("Failed to delete package");
    }
  };

  return (
    <Card className={`relative border transition-all hover:shadow-md ${pkg.isActive ? "border-border" : "border-border/50 opacity-70"}`}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground text-sm truncate">{pkg.name}</h3>
              <Badge className={`text-[10px] px-1.5 py-0 border ${typeColors[pkg.type]}`}>
                {typeLabels[pkg.type]}
              </Badge>
              {pkg.isActive ? (
                <Badge className="text-[10px] px-1.5 py-0 border bg-emerald-400/10 text-emerald-400 border-emerald-400/30">
                  Active
                </Badge>
              ) : (
                <Badge className="text-[10px] px-1.5 py-0 border bg-red-400/10 text-red-400 border-red-400/30">
                  Inactive
                </Badge>
              )}
            </div>
            {pkg.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{pkg.description}</p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 cursor-pointer">
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border w-44">
              <DropdownMenuItem onClick={() => onEdit(pkg._id)} className="cursor-pointer text-sm">
                <Pencil size={13} className="mr-2" /> Edit Package
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggle} className="cursor-pointer text-sm">
                {pkg.isActive ? (
                  <><ToggleLeft size={13} className="mr-2" /> Deactivate</>
                ) : (
                  <><ToggleRight size={13} className="mr-2" /> Activate</>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="cursor-pointer text-sm text-destructive focus:text-destructive"
              >
                <Trash2 size={13} className="mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Price & speed */}
        <div className="flex items-end justify-between mb-3">
          <div>
            <span className="text-xl font-bold text-foreground">
              KES {pkg.price.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground ml-1">/mo</span>
          </div>
          <span className="text-sm font-semibold text-violet-400">{pkg.speed}</span>
        </div>

        {/* Speed details */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Download size={11} className="text-emerald-400" />
            <span>{pkg.downloadSpeed} Mbps</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Upload size={11} className="text-blue-400" />
            <span>{pkg.uploadSpeed} Mbps</span>
          </div>
        </div>

        {/* Subscriber count */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users size={12} className="text-violet-400" />
            <span>
              <span className="font-semibold text-foreground">{pkg.subscriberCount}</span>{" "}
              subscriber{pkg.subscriberCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
