# Project instructions

## Deployment and GitHub

- Deploy only when the user explicitly asks for deployment. Finishing work, committing or pushing does not authorize deployment.
- Every authorized deployment must include committing and pushing the release source, runtime assets, tests and relevant documentation to the private `ilya-baimetov/mabear` GitHub repository.
- Validate the release, then commit and push it before deploying so the deployed source is recoverable from GitHub. Preserve existing history; do not force-push.
- After deployment, record the deployed version, release source commit and verification results. Commit and push that deployment record as well.
- Keep credentials, local environment files, build output and ignored intermediate captures out of Git. If a push or deployment fails, resolve it or report the incomplete step explicitly.
- Deployment remains a separate manual action; do not introduce automatic deployment on push without explicit authorization.
