import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../worker/direct',()=>({handleDirect:vi.fn(async()=>Response.json({source:'llm',beatScript:{beats:[{actor:'lady_bear',verb:'wave'}]}}))}));
import worker from '../../worker/bridge';
import {handleDirect} from '../../worker/direct';
import {resetRateLimits} from '../../worker/rateLimit';
const env=()=>({ANTHROPIC_API_KEY:'unit-test-only',ASSETS:{fetch:vi.fn()},STORY_SERVICE:{fetch:vi.fn(async(_request:Request)=>new Response(null,{status:200}))}});
const req=(headers:Record<string,string>={})=>new Request('https://storybook.example/api/direct',{method:'POST',headers:{cookie:'mb_session=test','content-type':'application/json',...headers},body:'{}'});
beforeEach(()=>{vi.clearAllMocks();resetRateLimits();});
describe('expanded director routing',()=>{
 it('authenticates on original service, then directs with its own key and current cast',async()=>{const e=env();const response=await worker.fetch(req(),e);expect(response.status).toBe(200);expect(e.STORY_SERVICE.fetch).toHaveBeenCalledOnce();expect(e.STORY_SERVICE.fetch.mock.calls[0][0].method).toBe('HEAD');expect(handleDirect).toHaveBeenCalledWith(expect.any(Request),e);expect((await response.json() as any).beatScript.beats[0].actor).toBe('lady_bear');});
 it('cannot bypass a session limit by changing unrelated cookies',async()=>{const e=env();for(let i=0;i<30;i++)expect((await worker.fetch(req({cookie:`mb_session=test; unrelated=${i}`}),e)).status).toBe(200);expect((await worker.fetch(req({cookie:'mb_session=test; unrelated=again'}),e)).status).toBe(429);expect(handleDirect).toHaveBeenCalledTimes(30);});
 it('rejects cross-origin paid requests and unauthenticated requests',async()=>{expect((await worker.fetch(req({origin:'https://elsewhere.example'}),env())).status).toBe(403);const e=env();e.STORY_SERVICE.fetch.mockResolvedValue(new Response(null,{status:302}));expect((await worker.fetch(req(),e)).status).toBe(401);expect(handleDirect).not.toHaveBeenCalled();});
});
