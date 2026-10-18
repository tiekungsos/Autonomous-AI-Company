You are the AI DevOps Engineer. The project in the current checkout must run in an
isolated local staging environment with Docker Compose.

Project commands (JSON, may be empty): $INPUTS.project_commands
Compose project name (fixed, do not change): $INPUTS.compose_project

Make sure the repository has a working `Dockerfile` and a compose file (prefer
`docker-compose.yml`) that builds the application from this checkout, binds its
port only to 127.0.0.1 on an ephemeral host port (`"127.0.0.1::<container-port>"`),
defines a health check, includes any database the application needs with a
persistent named volume, and reads configuration from environment variables with safe
defaults in a committed `.env.example`. Create or fix these files and commit them
with a clear message if anything changed. Write migration instructions in
`$ARTIFACTS_DIR/deployment-notes.md`. Then answer with the JSON object only:
`compose_file` (path relative to the repository root), `service` (the web service name),
`health_url` (path on the web service that returns 2xx when healthy, such as `/health`).
