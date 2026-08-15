"""Collections REST API router for managing persisted collections and requests."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from piddi.config import get_config
from piddi.models.collection import Collection, CollectionCreate
from piddi.models.request import CanonicalRequestModel
from piddi.storage.file_manager import (
    WorkspaceFileManager,
    generate_collection_id,
    generate_request_id,
)

router = APIRouter(prefix="/api/collections", tags=["collections"])


class DeleteCollectionResponse(BaseModel):
    """Response schema for collection deletion."""

    deleted: bool
    id: str


@router.get("", response_model=list[Collection])
async def list_collections() -> list[Collection]:
    """List all valid collections in the active workspace."""
    config = get_config()
    summary = await WorkspaceFileManager.load_workspace(config.workspace_path)
    return summary.collections


@router.post("", response_model=Collection, status_code=status.HTTP_201_CREATED)
async def create_collection(payload: CollectionCreate) -> Collection:
    """Create a new empty collection on disk."""
    config = get_config()
    collection = Collection(
        id=generate_collection_id(),
        name=payload.name,
        description=payload.description,
        requests=[],
    )
    saved = await WorkspaceFileManager.save_collection(config.workspace_path, collection)
    return saved


@router.get("/{collection_id}", response_model=Collection)
async def get_collection(collection_id: str) -> Collection:
    """Retrieve a single collection by ID."""
    config = get_config()
    try:
        WorkspaceFileManager.validate_id(collection_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    collection = await WorkspaceFileManager.get_collection(config.workspace_path, collection_id)
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Collection '{collection_id}' not found.",
        )
    return collection


@router.put("/{collection_id}", response_model=Collection)
async def update_collection(collection_id: str, payload: Collection) -> Collection:
    """Update a collection on disk."""
    config = get_config()
    try:
        WorkspaceFileManager.validate_id(collection_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    if payload.id != collection_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Collection ID in path does not match request body ID.",
        )

    # Verify collection exists
    existing = await WorkspaceFileManager.get_collection(config.workspace_path, collection_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Collection '{collection_id}' not found.",
        )

    try:
        saved = await WorkspaceFileManager.save_collection(config.workspace_path, payload)
        return saved
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.delete("/{collection_id}", response_model=DeleteCollectionResponse)
async def delete_collection(collection_id: str) -> DeleteCollectionResponse:
    """Delete a collection file from disk."""
    config = get_config()
    try:
        WorkspaceFileManager.validate_id(collection_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    deleted = await WorkspaceFileManager.delete_collection(config.workspace_path, collection_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Collection '{collection_id}' not found.",
        )
    return DeleteCollectionResponse(deleted=True, id=collection_id)


@router.post(
    "/{collection_id}/requests",
    response_model=Collection,
    status_code=status.HTTP_201_CREATED,
)
async def add_request_to_collection(
    collection_id: str, request: CanonicalRequestModel
) -> Collection:
    """Add a request to a collection."""
    config = get_config()
    try:
        WorkspaceFileManager.validate_id(collection_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    collection = await WorkspaceFileManager.get_collection(config.workspace_path, collection_id)
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Collection '{collection_id}' not found.",
        )

    if not request.id:
        request.id = generate_request_id()

    # Append request and save
    collection.requests.append(request)
    try:
        saved = await WorkspaceFileManager.save_collection(config.workspace_path, collection)
        return saved
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.put("/{collection_id}/requests/{request_id}", response_model=Collection)
async def update_request_in_collection(
    collection_id: str, request_id: str, request: CanonicalRequestModel
) -> Collection:
    """Update a specific request inside a collection."""
    config = get_config()
    try:
        WorkspaceFileManager.validate_id(collection_id)
        WorkspaceFileManager.validate_id(request_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    collection = await WorkspaceFileManager.get_collection(config.workspace_path, collection_id)
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Collection '{collection_id}' not found.",
        )

    req_index = next((i for i, r in enumerate(collection.requests) if r.id == request_id), None)
    if req_index is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Request '{request_id}' not found in collection '{collection_id}'.",
        )

    request.id = request_id
    collection.requests[req_index] = request

    try:
        saved = await WorkspaceFileManager.save_collection(config.workspace_path, collection)
        return saved
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.delete("/{collection_id}/requests/{request_id}", response_model=Collection)
async def delete_request_from_collection(collection_id: str, request_id: str) -> Collection:
    """Delete a specific request from a collection."""
    config = get_config()
    try:
        WorkspaceFileManager.validate_id(collection_id)
        WorkspaceFileManager.validate_id(request_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    collection = await WorkspaceFileManager.get_collection(config.workspace_path, collection_id)
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Collection '{collection_id}' not found.",
        )

    original_len = len(collection.requests)
    collection.requests = [r for r in collection.requests if r.id != request_id]

    if len(collection.requests) == original_len:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Request '{request_id}' not found in collection '{collection_id}'.",
        )

    try:
        saved = await WorkspaceFileManager.save_collection(config.workspace_path, collection)
        return saved
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
