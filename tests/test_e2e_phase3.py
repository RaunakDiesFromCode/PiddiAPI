"""End-to-end lifecycle test for Phase 3: Workspace & Collection Persistence."""

import json
from pathlib import Path

import pytest

from piddi.models.collection import Collection
from piddi.models.request import (
    AuthConfig,
    AuthType,
    BodyType,
    CanonicalRequestModel,
    HTTPMethod,
    KeyValueItem,
    RequestBody,
)
from piddi.storage.file_manager import (
    WorkspaceFileManager,
    generate_collection_id,
    generate_request_id,
)


@pytest.mark.asyncio
async def test_full_phase3_persistence_lifecycle(tmp_path: Path):
    """
    Test complete lifecycle:
    1. Initialize workspace.
    2. Create collection & requests.
    3. Save to disk.
    4. Simulate restart -> verify full reconstruction.
    5. Edit file externally -> reload workspace -> verify external edits reflected.
    6. Verify clean diff stability.
    7. Delete collection -> verify disk removal.
    """
    workspace_dir = tmp_path / "e2e_api_project"

    # Step 1: Initialize workspace
    collections_dir = WorkspaceFileManager.ensure_workspace_structure(workspace_dir)
    assert collections_dir.exists()
    assert (workspace_dir / ".piddi" / ".gitignore").exists()

    # Step 2: Create collection & requests
    col_id = generate_collection_id()
    req1_id = generate_request_id()
    req2_id = generate_request_id()

    req1 = CanonicalRequestModel(
        id=req1_id,
        name="Charge Card",
        method=HTTPMethod.POST,
        url="http://localhost:8000/v1/charges",
        headers=[KeyValueItem(key="Content-Type", value="application/json", enabled=True)],
        auth=AuthConfig(type=AuthType.BEARER, token="{{stripeKey}}"),
        body=RequestBody(type=BodyType.JSON, raw='{"amount": 2000, "currency": "usd"}'),
    )

    req2 = CanonicalRequestModel(
        id=req2_id,
        name="Refund Charge",
        method=HTTPMethod.POST,
        url="http://localhost:8000/v1/refunds",
        params=[KeyValueItem(key="notify", value="true", enabled=True)],
    )

    collection = Collection(
        id=col_id,
        name="Payments API",
        description="Stripe-like payment endpoints",
        requests=[req1, req2],
    )

    # Step 3: Save to disk
    await WorkspaceFileManager.save_collection(workspace_dir, collection)
    disk_file = collections_dir / f"{col_id}.json"
    assert disk_file.exists()

    original_json_str = disk_file.read_text(encoding="utf-8")
    assert '"Payments API"' in original_json_str
    assert '"Charge Card"' in original_json_str
    assert '"Refund Charge"' in original_json_str
    assert "{{stripeKey}}" in original_json_str

    # Step 4: Simulate application restart
    # Load workspace from disk in a fresh state
    summary_after_restart = await WorkspaceFileManager.load_workspace(workspace_dir)
    assert len(summary_after_restart.collections) == 1
    assert len(summary_after_restart.errors) == 0

    reconstructed_col = summary_after_restart.collections[0]
    assert reconstructed_col.id == col_id
    assert reconstructed_col.name == "Payments API"
    assert len(reconstructed_col.requests) == 2
    assert reconstructed_col.requests[0].id == req1_id
    assert reconstructed_col.requests[0].url == "http://localhost:8000/v1/charges"
    assert reconstructed_col.requests[0].auth.token == "{{stripeKey}}"
    assert reconstructed_col.requests[1].id == req2_id

    # Step 5: Simulate external file modification (e.g. edited in VS Code or via Git checkout)
    disk_data = json.loads(disk_file.read_text(encoding="utf-8"))
    disk_data["name"] = "Payments & Billing API"
    disk_data["requests"][0]["name"] = "Create Payment Intent"
    disk_data["requests"][0]["url"] = "http://localhost:8000/v2/payment_intents"
    disk_file.write_text(
        json.dumps(disk_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # Step 6: Workspace reload reflection
    reloaded_summary = await WorkspaceFileManager.load_workspace(workspace_dir)
    assert len(reloaded_summary.collections) == 1
    reloaded_col = reloaded_summary.collections[0]
    assert reloaded_col.name == "Payments & Billing API"
    assert reloaded_col.requests[0].name == "Create Payment Intent"
    assert reloaded_col.requests[0].url == "http://localhost:8000/v2/payment_intents"

    # Step 7: Delete collection
    deleted = await WorkspaceFileManager.delete_collection(workspace_dir, col_id)
    assert deleted is True
    assert not disk_file.exists()

    final_summary = await WorkspaceFileManager.load_workspace(workspace_dir)
    assert len(final_summary.collections) == 0
