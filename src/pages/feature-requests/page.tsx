import ComingSoonPage from "../_components/coming-soon-page.tsx";
import { Lightbulb, ThumbsUp, MessageCircle, Flag, TrendingUp, Users } from "lucide-react";

export default function FeatureRequestsPage() {
  return (
    <ComingSoonPage
      title="Feature Requests"
      description="Submit and vote on feature requests. Help shape the future of the NetAdmin operator portal by sharing your ideas."
      icon={Lightbulb}
      accentColor="text-yellow-400"
      features={[
        { icon: Flag, label: "Submit Ideas", description: "Propose new features for the platform" },
        { icon: ThumbsUp, label: "Vote", description: "Upvote features you want to see built" },
        { icon: TrendingUp, label: "Popular Requests", description: "See what the community wants most" },
        { icon: MessageCircle, label: "Discuss", description: "Comment on and refine ideas together" },
        { icon: Users, label: "Community", description: "Connect with other operators" },
        { icon: Lightbulb, label: "Status Tracking", description: "Follow requests from idea to live" },
      ]}
    />
  );
}
