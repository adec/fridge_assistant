"""Read-only Mealie client and atomic recipe cache, independent of HA APIs."""
from __future__ import annotations

import asyncio
import hashlib
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit, urlunsplit


class MealieError(ValueError):
    """Safe, user-facing error; never include response bodies or credentials."""


def base_url(value: str) -> str:
    try:
        parts = urlsplit(value.strip())
        port = parts.port  # validate malformed ports
    except ValueError as err:
        raise MealieError("invalid_url") from err
    if (parts.scheme not in ("http", "https") or not parts.hostname
            or parts.username or parts.password or parts.query or parts.fragment
            or parts.path.strip("/") or (port is not None and port < 1)):
        raise MealieError("invalid_url")
    return urlunsplit((parts.scheme, parts.netloc, "", "", ""))


def identity(url: str, token: str) -> str:
    return hashlib.sha256((url + "\0" + token).encode()).hexdigest()


class MealieClient:
    def __init__(self, session, url: str, token: str):
        self.session = session
        self.url = base_url(url)
        self.token = token.strip()
        if not self.token:
            raise MealieError("missing_token")

    async def get(self, path: str, params=None):
        try:
            async with asyncio.timeout(20):
                async with self.session.get(self.url + "/api/" + path,
                                            params=params,
                                            headers={"Authorization": "Bearer " + self.token},
                                            allow_redirects=False) as response:
                    if response.status in (401, 403):
                        raise MealieError("authentication")
                    if response.status == 404:
                        raise MealieError("unsupported_api")
                    if response.status != 200:
                        raise MealieError("server_error")
                    data = await response.json()
                    if not isinstance(data, dict):
                        raise MealieError("invalid_response")
                    return data
        except MealieError:
            raise
        except TimeoutError as err:
            raise MealieError("timeout") from err
        except Exception as err:
            raise MealieError("connection") from err

    async def pages(self, path: str) -> list[dict]:
        records = []
        for page in range(1, 51):
            data = await self.get(path, {"page": page, "perPage": 100})
            batch = data.get("items")
            if not isinstance(batch, list) or any(not isinstance(x, dict) or not x.get("id") for x in batch):
                raise MealieError("invalid_response")
            records.extend(batch)
            total = data.get("totalPages")
            if total is not None and (not isinstance(total, int) or total < 0):
                raise MealieError("invalid_response")
            if not batch or (total is not None and page >= total) or (total is None and len(batch) < 100):
                return records
        raise MealieError("too_large")

    async def test(self):
        # Same authenticated API used by sync, no Mealie writes.
        result = await self.get("recipes", {"page": 1, "perPage": 1})
        if not isinstance(result.get("items"), list):
            raise MealieError("invalid_response")

    async def snapshot(self) -> dict:
        async with asyncio.timeout(180):
            group = await self.get("groups/self")
            if not isinstance(group.get("slug"), str) or not group["slug"]:
                raise MealieError("invalid_response")
            foods = await self.pages("foods")
            summaries = await self.pages("recipes")
            if len(summaries) > 1000:
                raise MealieError("too_large")
            semaphore = asyncio.Semaphore(4)
            recipes = [None] * len(summaries)

            async def detail(index, summary):
                async with semaphore:
                    recipe = await self.get("recipes/" + quote(str(summary.get("slug") or summary["id"]), safe=""))
                    ingredients = recipe.get("recipeIngredient")
                    if not isinstance(ingredients, list) or any(not isinstance(i, dict) for i in ingredients):
                        raise MealieError("invalid_response")
                    if not recipe.get("id") or not recipe.get("slug"):
                        raise MealieError("invalid_response")
                    recipes[index] = {"id": str(recipe["id"]), "slug": recipe["slug"],
                                      "name": recipe.get("name") or recipe["slug"],
                                      "ingredients": [{"food_id": str(i["food"]["id"]) if isinstance(i.get("food"), dict) and i["food"].get("id") else None,
                                                       "name": (i.get("food") or {}).get("name", "") if isinstance(i.get("food"), dict) else "",
                                                       "text": i.get("display") or i.get("note") or ""}
                                                      for i in ingredients]}
            # TaskGroup cancels remaining requests if any detail fails.
            try:
                async with asyncio.TaskGroup() as tasks:
                    for index, summary in enumerate(summaries):
                        tasks.create_task(detail(index, summary))
            except ExceptionGroup as errors:
                def first(error):
                    if isinstance(error, MealieError): return error
                    if isinstance(error, BaseExceptionGroup):
                        for child in error.exceptions:
                            found = first(child)
                            if found: return found
                    return None
                raise first(errors) or MealieError("connection") from None
            return {"identity": identity(self.url, self.token), "group_slug": group["slug"], "foods": [{"id": str(f["id"]), "name": f.get("name", "")} for f in foods],
                    "recipes": recipes, "last_sync": datetime.now(timezone.utc).isoformat()}


class MealieSync:
    def __init__(self, session, url, token, cache, persist):
        self.client = MealieClient(session, url, token) if url and token else None
        self.persist = persist
        self.cache = cache if self.client and cache.get("identity") == identity(self.client.url, self.client.token) else {}
        self.busy = False
        self.error = None
        self._lock = asyncio.Lock()

    def status(self):
        return {"configured": self.client is not None, "syncing": self.busy,
                "error": self.error, "last_sync": self.cache.get("last_sync"),
                "recipe_count": len(self.cache.get("recipes", [])),
                "food_count": len(self.cache.get("foods", []))}

    async def refresh(self):
        if not self.client: raise MealieError("not_configured")
        if self._lock.locked(): raise MealieError("busy")
        async with self._lock:
            self.busy = True
            try:
                snapshot = await self.client.snapshot()
                # Commit only a complete, persisted snapshot. Keep old cache on failure.
                await self.persist(snapshot)
                self.cache = snapshot
                self.error = None
            except TimeoutError:
                self.error = "timeout"
                raise MealieError("timeout") from None
            except MealieError as err:
                self.error = str(err)
                raise
            except Exception:
                self.error = "storage_error"
                raise
            finally:
                self.busy = False
