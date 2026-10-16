import type {
  TestConvexForDataModel,
  TestConvexForDataModelAndIdentity,
} from "convex-test";
import type { DataModelFromSchemaDefinition } from "convex/server";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;

export async function createWorkspaceFixture(
  t: TestConvexForDataModelAndIdentity<TestDataModel>,
  owner: TestConvexForDataModel<TestDataModel>,
  name: string,
) {
  const userId = await owner.mutation(api.users.updateCurrentUser, {});
  const now = new Date().toISOString();
  return await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      name,
      createdBy: userId,
      createdAt: now,
    });
    await ctx.db.insert("workspace_members", {
      workspaceId,
      userId,
      role: "owner",
      joinedAt: now,
    });
    return workspaceId;
  });
}
