"""FastAPI main application entrypoint with middleware, health check, and route registration."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api.routes import api_router

settings = get_settings()

app = FastAPI(
    title="CiteLock API",
    description="Self-correcting RAG engine and hallucination auditing platform.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure Cross-Origin Resource Sharing (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Unauthenticated health check endpoint
@app.get("/health", tags=["System"])
def health_check():
    """Service health check endpoint for container orchestrators and Render."""
    # TODO: Add database ping and storage bucket connectivity verification
    return {
        "status": "ok",
        "service": "citelock-backend",
        "version": "0.1.0",
    }

# Register all v1 API routers
app.include_router(api_router)

# TODO: Add exception handlers for custom domain errors and OpenTelemetry middleware
