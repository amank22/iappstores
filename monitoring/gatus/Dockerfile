# Gatus with this repo's config baked in, so monitoring changes are reviewed like code.
# The upstream image is FROM scratch (no shell), so Coolify's built-in health check must
# stay off for this app; Gatus monitors the other services, not itself.
FROM twinproduction/gatus:v5.38.0

COPY config.yaml /config/config.yaml

EXPOSE 8080
