# Maintainer release checklist

The package currently declares version `0.1.0`, but the repository does not yet have a published GitHub release. Do not assume a version string means a tag or binary distribution exists.

1. Confirm the intended changes, review open security issues and update [CHANGELOG.md](../CHANGELOG.md).
2. Run `npm ci` and `npm test` with supported Node versions, and confirm the Docker build works in CI.
3. Verify the public dashboard and admin interface on desktop and mobile, in light and dark themes, for UI changes.
4. Review deployment and security instructions for any new environment variables or capabilities.
5. Update `package.json` and the lockfile when changing version.
6. Merge reviewed changes into `main` after CI succeeds.
7. Create an annotated `vX.Y.Z` tag **only after** the version is ready; publish a GitHub release with release notes and any migration or rollback instructions.
8. Verify badge, changelog, README and deployment links after publishing.

Never publish keys, credentials, customer data, service URLs from private deployments or unredacted logs. Releases and tags are maintainer actions, not automatic results of a passing CI run.
