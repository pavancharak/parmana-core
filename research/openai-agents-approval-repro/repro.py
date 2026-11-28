import asyncio
from agents import Agent, Runner
from agents.decorators import tool
from agents.testing import ScriptedModel, function_call, assistant_message

executed = []

@tool(needs_approval=True)
async def write_marker(path: str) -> str:
    executed.append(path)
    return "ok"

def script():
    return ScriptedModel([
        [function_call("write_marker", '{"path":"A"}', call_id="call_fixed")],
        [assistant_message("done")],
    ])

async def main():
    agent = Agent(name="m", model=script(), tools=[write_marker])
    r1 = await Runner.run(agent, "do it")
    item1 = r1.interruptions[0]
    s1 = r1.to_state()
    s1.approve(item1)
    await Runner.run(agent, s1)
    print("after run 1:", executed)

    agent.model = script()  # same Agent instance, new run
    r2 = await Runner.run(agent, "do it again")
    print("run 2 interruptions before stale approve:", len(r2.interruptions))
    s2 = r2.to_state()
    s2.approve(item1)  # run 1's item
    r2b = await Runner.run(agent, s2)
    print("run 2 interruptions after resume:", len(r2b.interruptions))
    print("executed:", executed)

asyncio.run(main())
