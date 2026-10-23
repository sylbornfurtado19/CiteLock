"""API routes initialization and unified router aggregation."""

from fastapi import APIRouter

from app.api.routes.workspaces import router as workspaces_router
from app.api.routes.documents import router as documents_router
from app.api.routes.queries import router as queries_router
from app.api.routes.audits import router as audits_router
from app.api.routes.analytics import router as analytics_router
from app.api.routes.verify import router as verify_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(workspaces_router)
api_router.include_router(documents_router)
api_router.include_router(queries_router)
api_router.include_router(audits_router)
api_router.include_router(analytics_router)
api_router.include_router(verify_router)

__all__ = ["api_router"]
