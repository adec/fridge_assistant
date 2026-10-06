"""Read-only client, pagination, cancellation and cache isolation."""
import asyncio
import copy
import unittest
from tests.hastubs import load_module
m = load_module('mealie')

class Response:
    def __init__(self, data, status=200): self.data=data; self.status=status
    async def __aenter__(self): return self
    async def __aexit__(self,*args): pass
    async def json(self): return copy.deepcopy(self.data)

class Session:
    def __init__(self, responses): self.responses=list(responses); self.calls=[]
    def get(self,url,**kwargs):
        self.calls.append((url,kwargs))
        response=self.responses.pop(0)
        if isinstance(response,Exception): raise response
        return response

class TestMealieClient(unittest.IsolatedAsyncioTestCase):
    def client(self,responses):
        session=Session(responses);return m.MealieClient(session,'http://mealie:9000/','secret'),session

    async def test_read_only_connection(self):
        client,session=self.client([Response({'items':[]})]);await client.test()
        self.assertEqual(session.calls[0][0],'http://mealie:9000/api/recipes')
        self.assertFalse(session.calls[0][1]['allow_redirects'])
        self.assertEqual(session.calls[0][1]['headers']['Authorization'],'Bearer secret')

    async def test_auth_redirect_and_server_errors_are_safe(self):
        for status,code in [(401,'authentication'),(403,'authentication'),(307,'server_error'),(404,'unsupported_api'),(500,'server_error')]:
            client,_=self.client([Response({'token':'secret'},status)])
            with self.assertRaisesRegex(m.MealieError,'^'+code+'$'):await client.test()

    async def test_connection_error_does_not_leak_token(self):
        client,_=self.client([OSError('secret at url')])
        with self.assertRaisesRegex(m.MealieError,'^connection$'):await client.test()

    async def test_wrong_server_response_is_rejected(self):
        client,_=self.client([Response({'html':'wrong server'})])
        with self.assertRaisesRegex(m.MealieError,'invalid_response'):await client.test()

    async def test_paginated_foods(self):
        client,session=self.client([Response({'items':[{'id':'a'}],'totalPages':2}),Response({'items':[{'id':'b'}],'totalPages':2})])
        self.assertEqual(await client.pages('foods'),[{'id':'a'},{'id':'b'}]);self.assertEqual(session.calls[-1][1]['params']['page'],2)

    async def test_invalid_page_rejected(self):
        for data in [{'items':None},{'items':[{}]},{'items':[],'totalPages':'2'}]:
            client,_=self.client([Response(data)])
            with self.assertRaisesRegex(m.MealieError,'invalid_response'):await client.pages('foods')

    async def test_snapshot_keeps_food_ids_and_unparsed_lines(self):
        client,session=self.client([Response({'slug':'family'}),Response({'items':[{'id':'spinach','name':'Spinach'}]}),Response({'items':[{'id':'r','slug':'soup'}]}),Response({'id':'r','slug':'soup','name':'Soup','recipeIngredient':[{'food':{'id':'spinach','name':'Spinach'},'display':'1 bag spinach'},{'food':None,'note':'salt to taste'}]})])
        result=await client.snapshot();self.assertEqual(result['recipes'][0]['ingredients'][0]['food_id'],'spinach');self.assertIsNone(result['recipes'][0]['ingredients'][1]['food_id']);self.assertNotIn('secret',str(result));self.assertTrue(result['last_sync']);self.assertEqual(result['group_slug'],'family')

    async def test_failed_detail_aborts_snapshot(self):
        client,_=self.client([Response({'slug':'family'}),Response({'items':[]}),Response({'items':[{'id':'r','slug':'soup'}]}),Response({},500)])
        with self.assertRaisesRegex(m.MealieError,'server_error'):await client.snapshot()

    async def test_empty_library_is_successful(self):
        client,_=self.client([Response({'slug':'family'}),Response({'items':[]}),Response({'items':[]})]);result=await client.snapshot();self.assertEqual(result['recipes'],[])

    async def test_malformed_details_rejected(self):
        client,_=self.client([Response({'slug':'family'}),Response({'items':[]}),Response({'items':[{'id':'r'}]}),Response({'id':'r','slug':'soup','recipeIngredient':None})])
        with self.assertRaisesRegex(m.MealieError,'invalid_response'):await client.snapshot()

    async def test_sync_keeps_cache_on_failed_refresh_and_persistence(self):
        old={'identity':m.identity('http://mealie:9000','secret'),'recipes':[{'id':'old'}]}
        async def persist(snapshot): raise OSError('disk full')
        sync=m.MealieSync(Session([]),'http://mealie:9000','secret',old,persist)
        async def fail():raise m.MealieError('timeout')
        sync.client.snapshot=fail
        with self.assertRaises(m.MealieError):await sync.refresh()
        self.assertEqual(sync.cache,old);self.assertEqual(sync.error,'timeout');self.assertFalse(sync.busy)
        async def good():return {'recipes':[{'id':'new'}]}
        sync.client.snapshot=good
        with self.assertRaises(OSError):await sync.refresh()
        self.assertEqual(sync.cache,old);self.assertFalse(sync.busy)

    async def test_success_replaces_snapshot_and_clears_error(self):
        seen=[]
        async def persist(snapshot):seen.append(snapshot)
        sync=m.MealieSync(Session([]),'http://mealie:9000','secret',{},persist);sync.error='timeout'
        async def good():return {'recipes':[],'foods':[],'last_sync':'now'}
        sync.client.snapshot=good;await sync.refresh();self.assertIsNone(sync.error);self.assertEqual(sync.cache,seen[0])

    async def test_concurrent_refresh_is_rejected(self):
        async def persist(snapshot):pass
        sync=m.MealieSync(Session([]),'http://mealie:9000','secret',{},persist)
        await sync._lock.acquire()
        try:
            with self.assertRaisesRegex(m.MealieError,'busy'):await sync.refresh()
        finally:sync._lock.release()

    async def test_same_connection_uses_saved_cache(self):
        async def persist(snapshot):pass
        cache={'identity':m.identity('http://mealie:9000','secret'),'recipes':[{'name':'Soup'}]}
        sync=m.MealieSync(Session([]),'http://mealie:9000','secret',cache,persist)
        self.assertEqual(sync.status()['recipe_count'],1)

    async def test_cancellation_releases_sync_lock(self):
        async def persist(snapshot):pass
        sync=m.MealieSync(Session([]),'http://mealie:9000','secret',{},persist)
        async def cancel():raise asyncio.CancelledError()
        sync.client.snapshot=cancel
        with self.assertRaises(asyncio.CancelledError):await sync.refresh()
        self.assertFalse(sync.busy);self.assertFalse(sync._lock.locked())

    async def test_other_connection_never_sees_cached_recipes(self):
        async def persist(snapshot):pass
        cache={'identity':m.identity('http://mealie:9000','old-token'),'recipes':[{'name':'private'}]}
        for url,token in [('http://mealie:9000','new-token'),('http://another','old-token'),('','')]:
            sync=m.MealieSync(Session([]),url,token,cache,persist);self.assertEqual(sync.cache,{})
            self.assertNotIn('token',str(sync.status()))

class TestMealieURL(unittest.TestCase):
    def test_url_validation(self):
        self.assertEqual(m.base_url(' https://example.local/ '),'https://example.local')
        for url in ['ftp://host','http://user:password@host','http://host/api','http://host?token=secret','http://host/#fragment','http://host:bad','http://host:0','http://']:
            with self.subTest(url=url),self.assertRaises(m.MealieError):m.base_url(url)
