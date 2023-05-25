import ScriptJobExecutor from "./ScriptJobExecutor"

class ComputeResource {
    #scriptJobExecutor: ScriptJobExecutor
    constructor(private a: { dir: string }) {
        this.#scriptJobExecutor = new ScriptJobExecutor({ dir: a.dir })
    }
    async start() {
        console.info('Starting compute resource.')
        this.#scriptJobExecutor.start()
    }
    async stop() {
        await this.#scriptJobExecutor.stop()
    }
}

export default ComputeResource