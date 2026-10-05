"""Managed locations: shelf-life mapping, lifecycle, persistence and migration."""
import asyncio
import copy
import unittest

from tests.hastubs import fake_hass, load_module

store_mod = load_module("store")


def make_store():
    store = store_mod.FridgeStore(fake_hass("en"))
    store._seed = store._read_seed()
    return store


class TestLocations(unittest.TestCase):
    def setUp(self):
        self.store = make_store()

    def create(self, name="Garage freezer", storage_type="freezer", **extra):
        return self.store.upsert_location({"name": name, "storage_type": storage_type, **extra})

    def test_archive_default_preserves_localized_name(self):
        self.store.upsert_location({"id": "freezer", "storage_type": "freezer", "archived": True})
        self.assertIsNone(self.store.locations["freezer"]["name"])
        self.assertEqual(self.store.location_label("freezer", "nl"), "Vriezer")

    def test_manual_empty_expiry_stays_empty(self):
        item = self.store.build_item({"name": "Milk", "expiry_date": "", "expiry_source": "manual"})
        self.assertEqual(item["expiry_date"], "")
        self.assertEqual(item["expiry_source"], "manual")

    def test_defaults_keep_legacy_ids(self):
        self.assertEqual(self.store.active_locations(), ["fridge", "freezer", "pantry"])
        self.assertEqual(self.store.location_label("pantry"), "Pantry")

    def test_custom_freezer_uses_freezer_duration(self):
        loc = self.create()
        item = self.store.build_item({"name": "Milk", "location": loc["id"], "added_date": "2026-10-01"})
        self.assertEqual(item["location"], loc["id"])
        self.assertEqual(item["expiry_date"], "2026-12-30")
        self.assertEqual(item["expiry_source"], "template")

    def test_custom_fridge_and_cupboard(self):
        for name, kind, expected in [("Drinks fridge", "fridge", 7), ("Dry cupboard", "pantry", None)]:
            with self.subTest(kind=kind):
                loc = self.create(name, kind)
                self.assertEqual(self.store.shelf_life_days(self.store.get_template("melk"), loc["id"]), expected)

    def test_ai_template_uses_type_without_custom_keys(self):
        loc = self.create()
        template = self.store.upsert_user_template({"name": "Homemade pie", "shelf_life": {"fridge": 3, "freezer": 60, "pantry": 1}, "source": "ai"})
        item = self.store.build_item({"name": template["name"], "template_id": template["id"], "location": loc["id"], "added_date": "2026-10-01"})
        self.assertEqual(item["expiry_date"], "2026-11-30")

    def test_rename_keeps_item_id_and_reference(self):
        loc = self.create()
        item = self.store.add_item(self.store.build_item({"name": "Milk", "location": loc["id"]}))
        before = copy.deepcopy(item)
        renamed = self.create("Utility freezer", id=loc["id"])
        self.assertEqual(renamed["id"], loc["id"])
        self.assertEqual(item, before)
        self.assertEqual(self.store.location_label(item["location"]), "Utility freezer")

    def test_builtin_can_be_renamed_in_both_languages(self):
        self.create("Kitchen fridge", "fridge", id="fridge")
        self.assertEqual(self.store.location_label("fridge", "nl"), "Kitchen fridge")
        self.assertEqual(self.store.location_label("fridge", "en"), "Kitchen fridge")

    def test_type_change_does_not_rewrite_expiry(self):
        loc = self.create()
        item = self.store.add_item(self.store.build_item({"name": "Milk", "location": loc["id"]}))
        before = copy.deepcopy(item)
        self.create("Garage freezer", "fridge", id=loc["id"])
        self.assertEqual(item, before)
        self.assertEqual(self.store.shelf_life_days(self.store.get_template("melk"), loc["id"]), 7)

    def test_move_preserves_manual_and_estimated_dates(self):
        loc = self.create()
        for source in ("manual", "template", "ai"):
            with self.subTest(source=source):
                item = self.store.add_item(self.store.build_item({"name": "Milk", "expiry_date": "2026-10-07", "expiry_source": source}))
                result = self.store.update_item(item["id"], {"location": loc["id"]})
                self.assertEqual(result["expiry_date"], "2026-10-07")
                self.assertEqual(result["expiry_source"], source)

    def test_archiving_keeps_existing_items_and_filter(self):
        loc = self.create()
        item = self.store.add_item(self.store.build_item({"name": "Milk", "location": loc["id"]}))
        self.create(id=loc["id"], archived=True)
        self.assertNotIn(loc["id"], self.store.active_locations())
        self.assertIn(loc["id"], self.store.locations_for_ui())
        self.assertEqual(self.store.locations_for_ui()[loc["id"]]["count"], 1)
        self.store.update_item(item["id"], {"name": "Opened milk", "location": loc["id"]})
        with self.assertRaisesRegex(store_mod.LocationError, "location_archived"):
            self.store.build_item({"name": "Milk", "location": loc["id"]})
        other = self.store.add_item(self.store.build_item({"name": "Milk"}))
        with self.assertRaisesRegex(store_mod.LocationError, "location_archived"):
            self.store.update_item(other["id"], {"name": "Changed", "location": loc["id"]})
        self.assertEqual(other["name"], "Milk")  # rejected mutation is atomic
        self.create(id=loc["id"], archived=False)
        self.store.update_item(other["id"], {"location": loc["id"]})

    def test_cannot_remove_location_with_inventory(self):
        loc = self.create()
        self.store.add_item(self.store.build_item({"name": "Milk", "location": loc["id"]}))
        with self.assertRaisesRegex(store_mod.LocationError, "location_in_use"):
            self.store.remove_location(loc["id"])
        self.assertIn(loc["id"], self.store.active_locations())

    def test_removed_location_keeps_history_restorable(self):
        loc = self.create()
        item = self.store.add_item(self.store.build_item({"name": "Milk", "location": loc["id"]}))
        event = self.store.complete_item(item["id"], "eaten")
        self.store.remove_location(loc["id"])
        self.assertNotIn(loc["id"], self.store.locations_for_ui())
        self.assertEqual(self.store.location_label(loc["id"]), "Garage freezer")
        restored = self.store.restore_item(event["id"])
        self.assertEqual(restored["location"], loc["id"])
        self.assertIn(loc["id"], self.store.locations_for_ui())
        self.assertNotIn(loc["id"], self.store.active_locations())
        self.store.update_item(restored["id"], {"location": "fridge"})

    def test_at_least_one_active_location(self):
        self.store.remove_location("freezer")
        self.store.upsert_location({"id": "pantry", "name": "Cupboard", "storage_type": "pantry", "archived": True})
        with self.assertRaisesRegex(store_mod.LocationError, "location_last_active"):
            self.store.remove_location("fridge")
        with self.assertRaisesRegex(store_mod.LocationError, "location_last_active"):
            self.store.upsert_location({"id": "fridge", "name": "Fridge", "storage_type": "fridge", "archived": True})
        self.assertEqual(self.store.active_locations(), ["fridge"])

    def test_default_add_uses_first_active_location(self):
        loc = self.create()
        self.store.reorder_locations([loc["id"], "fridge", "freezer", "pantry"])
        self.assertEqual(self.store.build_item({"name": "Milk"})["location"], loc["id"])

    def test_reordering_rejects_missing_or_duplicate_ids(self):
        before = copy.deepcopy(self.store.locations)
        for ids in (["fridge"], ["fridge", "fridge", "pantry"]):
            with self.assertRaisesRegex(store_mod.LocationError, "location_order_invalid"):
                self.store.reorder_locations(ids)
            self.assertEqual(self.store.locations, before)

    def test_validation(self):
        for data, key in [({"name": "", "storage_type": "freezer"}, "location_name_required"),
                          ({"name": "x" * 81, "storage_type": "freezer"}, "location_name_required"),
                          ({"name": "Garage", "storage_type": "outdoors"}, "location_type_invalid"),
                          ({"id": "unknown", "name": "Garage", "storage_type": "freezer"}, "location_not_found")]:
            with self.subTest(data=data), self.assertRaisesRegex(store_mod.LocationError, key):
                self.store.upsert_location(data)
        loc = self.create()
        with self.assertRaisesRegex(store_mod.LocationError, "location_name_duplicate"):
            self.create(" garage freezer ")
        self.assertEqual(self.store.location_label(loc["id"]), "Garage freezer")

    def test_save_reload_preserves_order_metadata_inventory_and_hidden_templates(self):
        loc = self.create()
        self.store.reorder_locations([loc["id"], "pantry", "freezer", "fridge"])
        item = self.store.add_item(self.store.build_item({"name": "Milk", "location": loc["id"]}))
        self.store.hidden.add("melk")
        self.store.upsert_user_template({"name": "My soup", "shelf_life": {"fridge": 2}})
        asyncio.run(self.store.async_save())
        saved = copy.deepcopy(self.store._store.saved)
        loaded = make_store()
        async def load(): return saved
        async def executor(fn): return fn()
        loaded._store.async_load = load
        loaded.hass.async_add_executor_job = executor
        asyncio.run(loaded.async_load())
        self.assertEqual(list(loaded.locations), list(self.store.locations))
        self.assertEqual(loaded.locations, self.store.locations)
        self.assertEqual(loaded.items[item["id"]], item)
        self.assertEqual(loaded.hidden, {"melk"})
        self.assertEqual(loaded.user_templates, self.store.user_templates)

    def test_v4_migration_preserves_all_existing_data(self):
        data = {"items": [{"id": "i1", "location": "freezer", "expiry_date": "2027-01-01"}],
                "history": [{"item": {"location": "pantry"}}], "hidden": ["melk"],
                "user_templates": [{"id": "mine", "name": "Soup"}]}
        before = copy.deepcopy(data)
        migrated = asyncio.run(store_mod.FridgeDataStore(fake_hass(), 5, "test")._async_migrate_func(4, 1, data))
        self.assertEqual(migrated.pop("locations"), list(store_mod.default_locations().values()))
        for record in [*before["items"], *before["user_templates"], before["history"][0]["item"]]:
            record["date_type"] = "use_by"
        self.assertEqual(migrated, before)

    def test_migration_never_overwrites_saved_locations(self):
        loc = self.create()
        data = {"locations": [loc]}
        migrated = asyncio.run(store_mod.FridgeDataStore(fake_hass(), 5, "test")._async_migrate_func(4, 1, copy.deepcopy(data)))
        self.assertEqual(migrated, data)


if __name__ == "__main__":
    unittest.main()
