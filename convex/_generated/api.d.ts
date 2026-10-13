/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit_logs from "../audit_logs.js";
import type * as dashboard from "../dashboard.js";
import type * as financials from "../financials.js";
import type * as http from "../http.js";
import type * as model_workspace from "../model/workspace.js";
import type * as network from "../network.js";
import type * as notifications from "../notifications.js";
import type * as onboarding from "../onboarding.js";
import type * as packages from "../packages.js";
import type * as radius from "../radius.js";
import type * as radius_helpers from "../radius_helpers.js";
import type * as reports from "../reports.js";
import type * as routers from "../routers.js";
import type * as sessions from "../sessions.js";
import type * as settings from "../settings.js";
import type * as sms from "../sms.js";
import type * as subscribers from "../subscribers.js";
import type * as tickets from "../tickets.js";
import type * as transactions from "../transactions.js";
import type * as users from "../users.js";
import type * as workspaceInvitations from "../workspaceInvitations.js";
import type * as workspaceInvitationsActions from "../workspaceInvitationsActions.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit_logs: typeof audit_logs;
  dashboard: typeof dashboard;
  financials: typeof financials;
  http: typeof http;
  "model/workspace": typeof model_workspace;
  network: typeof network;
  notifications: typeof notifications;
  onboarding: typeof onboarding;
  packages: typeof packages;
  radius: typeof radius;
  radius_helpers: typeof radius_helpers;
  reports: typeof reports;
  routers: typeof routers;
  sessions: typeof sessions;
  settings: typeof settings;
  sms: typeof sms;
  subscribers: typeof subscribers;
  tickets: typeof tickets;
  transactions: typeof transactions;
  users: typeof users;
  workspaceInvitations: typeof workspaceInvitations;
  workspaceInvitationsActions: typeof workspaceInvitationsActions;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
