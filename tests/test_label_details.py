"""Only deliberately printable information belongs below the hero date."""
import unittest
from tests.hastubs import load_module
from tests.test_store import make_store
mod=load_module('label_details')

class LabelDetailsTests(unittest.TestCase):
    def test_repeated_name_and_private_notes_not_printed(self):
        self.assertEqual(mod.label_sections({'name':'Beans','contents':'  BEANS  ','notes':'barcode 1234 / private note'}),[])

    def test_unicode_and_whitespace_normalisation(self):
        self.assertEqual(mod.label_sections({'name':'Whole beans','contents':'Ｗｈｏｌｅ\nbeans'}),[])

    def test_real_contents_are_retained(self):
        self.assertEqual(mod.label_sections({'name':'Dinner','contents':'Lentils and rice'}),[('CONTENTS','Lentils and rice')])

    def test_instruction_precedes_distinct_contents(self):
        self.assertEqual(mod.label_sections({'name':'Dinner','contents':'Lentils and rice','label_note':'Remove lid','notes':'do not print me'}),[('INSTRUCTIONS','Remove lid'),('CONTENTS','Lentils and rice')])

    def test_handling_reason_timestamps_and_original_date_take_priority(self):
        sections=mod.label_sections({'name':'Curry','contents':'Curry','handling_due_at':'2026-10-27T18:00:00+00:00','handling_reason':'defrosted','opened_at':'2026-10-26T18:00:00+00:00','defrosted_at':'2026-10-26T18:00:00+00:00','original_expiry_date':'2027-12-18','original_date_type':'best_before','label_note':'Remove lid'})
        self.assertEqual([s[0] for s in sections],['HANDLING DETAILS','INSTRUCTIONS'])
        self.assertTrue(sections[0][1].startswith('After defrosting'))
        self.assertIn('Thawed: 26 Oct 2026 18:00',sections[0][1])
        self.assertIn('Best before: 18 Dec 2027',sections[0][1])
        self.assertNotIn('Curry',sections[0][1])

    def test_pending_defrost_not_declared_complete(self):
        details=mod.label_sections({'name':'Curry','defrost_started_at':'2026-10-26T18:00:00+00:00'})[0][1]
        self.assertIn('Confirm when fully defrosted',details)
        self.assertNotIn('Thawed:',details)

    def test_dutch_headings_and_date(self):
        sections=mod.label_sections({'name':'Soep','label_note':'Deksel verwijderen','contents':'Met wortels'},'nl')
        self.assertEqual([s[0] for s in sections],['INSTRUCTIES','INHOUD'])

    def test_label_note_validation(self):
        self.assertEqual(mod.label_note('  Remove lid  '),'Remove lid')
        self.assertEqual(mod.label_note(None),'')
        for value in [False,123,'x'*501]:
            with self.assertRaises(ValueError):mod.label_note(value)

    def test_template_default_is_copied_and_not_retroactive(self):
        store=make_store('en');t=store.upsert_user_template({'name':'Note beans','label_note':'Drain before use'})
        item=store.build_item({'name':'Note beans','template_id':t['id']})
        self.assertEqual(item['label_note'],'Drain before use')
        store.upsert_user_template({'id':t['id'],'label_note':'Another instruction'})
        self.assertEqual(item['label_note'],'Drain before use')

    def test_item_override_suppression_and_update(self):
        store=make_store('en');t=store.upsert_user_template({'name':'Note beans','label_note':'Drain before use'})
        for note in ['','Keep the liquid']:
            item=store.add_item(store.build_item({'name':'Note beans','template_id':t['id'],'label_note':note}))
            self.assertEqual(item['label_note'],note)
            store.update_item(item['id'],{'label_note':'  Cover first  '})
            self.assertEqual(item['label_note'],'Cover first')
            store.update_item(item['id'],{'label_note':''})
            self.assertEqual(item['label_note'],'')
