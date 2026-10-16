export const PLATFORM_OWNER_EMAIL = "andywesonga43@gmail.com";

export function isPlatformAdminIdentity(
  tokenIdentifier: string | undefined,
  email: string | undefined,
  configuredTokenIdentifiers: string | undefined,
) {
  if (
    !tokenIdentifier ||
    email?.trim().toLowerCase() !== PLATFORM_OWNER_EMAIL
  ) {
    return false;
  }

  return (
    configuredTokenIdentifiers
      ?.split(",")
      .some((identifier) => identifier.trim() === tokenIdentifier) ?? false
  );
}

export function isPlatformOwnerIdentity(email: string | undefined) {
  return email?.trim().toLowerCase() === PLATFORM_OWNER_EMAIL;
}
