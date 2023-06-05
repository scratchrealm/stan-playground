import path from 'path';
import postPlaygroundRequestFromComputeResource from "./postPlaygroundRequestFromComputeResource";
import { GetDataBlobRequest, GetProjectFileRequest, PlaygroundResponse, SetProjectFileRequest, SetScriptJobPropertyRequest } from "./types/PlaygroundRequest";
import { SPScriptJob } from "./types/stan-playground-types";
import fs from 'fs';
import yaml from 'js-yaml'
import {ChildProcessWithoutNullStreams, spawn} from 'child_process'
import ChainFile from './ChainFile';
import { ComputeResourceConfig } from './ScriptJobExecutor';

type SpaOutput = {
    chains: {
        chainId: string,
        rawHeader: string,
        rawFooter: string,
        numWarmupDraws?: number,
        sequences: {
            [key: string]: number[]
        },
        variablePrefixesExcluded?: string[]
    }[]
}

class ScriptJobManager {
    #runningJobs: RunningJob[] = []
    constructor(private config: {dir: string, computeResourceConfig: ComputeResourceConfig, onScriptJobCompletedOrFailed: (job: RunningJob) => void}) {

    }
    async initiateJob(job: SPScriptJob): Promise<boolean> {
        // important to check whether job is already running
        if (this.#runningJobs.filter(x => x.scriptJob.scriptJobId === job.scriptJobId).length > 0) {
            return false
        }
        if (job.scriptFileName.endsWith(".py")) {
            return await this._initiatePythonJob(job)
        }
        else if (job.scriptFileName.endsWith('.spa')) {
            return await this._initiateSpaJob(job)
        }
        else {
            return false
        }
    }
    stop() {
        this.#runningJobs.forEach(j => j.stop())
    }
    async cleanupOldJobs() {
        // list all folders in script_jobs directory
        const scriptJobsDir = path.join(this.config.dir, 'script_jobs')
        if (!fs.existsSync(scriptJobsDir)) {
            return
        }
        const folders = await fs.promises.readdir(scriptJobsDir)
        for (const folder of folders) {
            const folderPath = path.join(this.config.dir, 'script_jobs', folder)
            const stat = await fs.promises.stat(folderPath)
            if (stat.isDirectory()) {
                // check how old the folder is
                const elapsedSec = (Date.now() - stat.mtimeMs) / 1000
                if (elapsedSec > 60 * 60 * 24) {
                    console.info(`Removing old script job folder: ${folderPath}`)
                    await fs.promises.rmdir(folderPath, {recursive: true})
                }
            }
        }
    }
    private async _initiatePythonJob(job: SPScriptJob): Promise<boolean> {
        const x = this.#runningJobs.filter(x => x.scriptJob.scriptFileName.endsWith('.py'))
        const {max_num_concurrent_python_jobs} = this.config.computeResourceConfig
        if (x.length >= max_num_concurrent_python_jobs) {
            return false
        }
        const a = new RunningJob(job, this.config)
        this._addRunningJob(a)
        const okay = await a.initiate()
        return okay
    }
    private async _initiateSpaJob(job: SPScriptJob): Promise<boolean> {
        const x = this.#runningJobs.filter(x => x.scriptJob.scriptFileName.endsWith('.spa'))
        const {max_num_concurrent_spa_jobs} = this.config.computeResourceConfig
        if (x.length >= max_num_concurrent_spa_jobs) {
            return false
        }
        const a = new RunningJob(job, this.config)
        this._addRunningJob(a)
        await a.initiate()
        return true
    }
    private _addRunningJob(job: RunningJob) {
        this.#runningJobs.push(job)
        job.onCompletedOrFailed(() => {
            // remove from list of running jobs
            this.#runningJobs = this.#runningJobs.filter(j => (j.scriptJob.scriptJobId !== job.scriptJob.scriptJobId))
            this.config.onScriptJobCompletedOrFailed(job)
        })
    }
}

export class RunningJob {
    #onCompletedOrFailedCallbacks: (() => void)[] = []
    #childProcess: ChildProcessWithoutNullStreams | null = null
    #status: 'pending' | 'running' | 'completed' | 'failed' = 'pending'
    constructor(public scriptJob: SPScriptJob, private config: {dir: string, computeResourceConfig: ComputeResourceConfig}) {
    }
    async initiate(): Promise<boolean> {
        console.info(`Initiating script job: ${this.scriptJob.scriptJobId} - ${this.scriptJob.scriptFileName}`)
        const okay = await this._setScriptJobProperty('status', 'running')
        if (!okay) {
            console.warn('Unable to set script job status to running')
            return false
        }
        this.#status = 'running'
        this._run().then(() => { // don't await this!
            //
        }).catch((err) => {
            console.error(err)
            console.error('Problem running script job')
        })
        return true
    }
    onCompletedOrFailed(callback: () => void) {
        this.#onCompletedOrFailedCallbacks.push(callback)
    }
    stop() {
        if (this.#childProcess) {
            try {
                this.#childProcess.kill()
            }
            catch (e) {
                console.warn(e)
                console.warn('Unable to kill child process in RunningJob:stop()')
            }
        }
    }
    public get status() {
        return this.#status
    }
    private async _setScriptJobProperty(property: string, value: any): Promise<boolean> {
        const req: SetScriptJobPropertyRequest = {
            type: 'setScriptJobProperty',
            timestamp: Date.now() / 1000,
            workspaceId: this.scriptJob.workspaceId,
            projectId: this.scriptJob.projectId,
            scriptJobId: this.scriptJob.scriptJobId,
            property,
            value
        }
        const resp = await this._postPlaygroundRequest(req)
        if (!resp) {
            throw Error('Unable to set script job property')
        }
        if (resp.type !== 'setScriptJobProperty') {
            console.warn(resp)
            throw Error('Unexpected response type. Expected setScriptJobProperty')
        }
        return resp.success
    }
    private async _postPlaygroundRequest(req: any): Promise<PlaygroundResponse> {
        return await postPlaygroundRequestFromComputeResource(req, {
            computeResourceId: this.config.computeResourceConfig.compute_resource_id,
            computeResourcePrivateKey: this.config.computeResourceConfig.compute_resource_private_key
        })
    }
    private async _loadFileContent(fileName: string): Promise<string> {
        const req: GetProjectFileRequest = {
            type: 'getProjectFile',
            timestamp: Date.now() / 1000,
            projectId: this.scriptJob.projectId,
            fileName
        }
        const resp = await this._postPlaygroundRequest(req)
        if (!resp) {
            throw Error('Unable to get project file')
        }
        if (resp.type !== 'getProjectFile') {
            console.warn(resp)
            throw Error('Unexpected response type. Expected getProjectFile')
        }
        return await this._loadDataBlob(resp.projectFile.contentSha1)
    }
    private async _loadDataBlob(sha1: string): Promise<string> {
        const req: GetDataBlobRequest = {
            type: 'getDataBlob',
            timestamp: Date.now() / 1000,
            workspaceId: this.scriptJob.workspaceId,
            projectId: this.scriptJob.projectId,
            sha1
        }
        const resp = await this._postPlaygroundRequest(req)
        if (!resp) {
            throw Error('Unable to get data blob')
        }
        if (resp.type !== 'getDataBlob') {
            console.warn(resp)
            throw Error('Unexpected response type. Expected getDataBlob')
        }
        return resp.content
    }
    async _setProjectFile(fileName: string, fileContent: string) {
        const req: SetProjectFileRequest = {
            type: 'setProjectFile',
            timestamp: Date.now() / 1000,
            workspaceId: this.scriptJob.workspaceId,
            projectId: this.scriptJob.projectId,
            fileName,
            fileContent
        }
        const resp = await this._postPlaygroundRequest(req)
        if (!resp) {
            throw Error('Unable to set project file')
        }
        if (resp.type !== 'setProjectFile') {
            console.warn(resp)
            throw Error('Unexpected response type. Expected setProjectFile')
        }
    }
    private async _run() {
        if (this.#childProcess) {
            throw Error('Unexpected: Child process already running')
        }
        const scriptFileName = this.scriptJob.scriptFileName
        const scriptFileContent = await this._loadFileContent(this.scriptJob.scriptFileName)
        const scriptJobDir = path.join(this.config.dir, 'script_jobs', this.scriptJob.scriptJobId)
        fs.mkdirSync(scriptJobDir, {recursive: true})
        fs.writeFileSync(path.join(scriptJobDir, scriptFileName), scriptFileContent)

        if (scriptFileName.endsWith('.spa')) {
            const spaFileName = scriptFileName
            const spaFileContent = scriptFileContent
            const spa = yaml.load(spaFileContent)
            const stanProgramFileName = spa['stan']
            const dataFileName = spa['data']
            if ((!stanProgramFileName) || (!dataFileName)) {
                throw new Error('Invalid SPA file')
            }
            const stanProgramFileContent = await this._loadFileContent(stanProgramFileName)
            const dataFileContent = await this._loadFileContent(dataFileName)
            fs.writeFileSync(path.join(scriptJobDir, stanProgramFileName), stanProgramFileContent)
            fs.writeFileSync(path.join(scriptJobDir, dataFileName), dataFileContent)
            const runPyContent = createRunPyContent(spaFileName)
            fs.writeFileSync(path.join(scriptJobDir, 'run.py'), runPyContent)
            const runShContent = `
set -e # exit on error and use return code of last command as return code of script
clean_up () {
    ARG=$?
    chmod -R 777 * # make sure all files are readable by everyone so that they can be deleted even if owned by docker user
    exit $ARG
} 
trap clean_up EXIT
python3 run.py
`
            fs.writeFileSync(path.join(scriptJobDir, 'run.sh'), runShContent)
        }
        else if (scriptFileName.endsWith('.py')) {
            const runShContent = `
set -e # exit on error and use return code of last command as return code of script
clean_up () {
    ARG=$?
    chmod -R 777 * # make sure all files are readable by everyone so that they can be deleted even if owned by docker user
    exit $ARG
} 
trap clean_up EXIT
python3 ${scriptFileName}
`
            fs.writeFileSync(path.join(scriptJobDir, 'run.sh'), runShContent)
        }

        const uploadSpaOutput = async () => {
            const spaOutput = await loadSpaOutput(`${scriptJobDir}/output`)
            console.info(`Uploading SPA output to ${scriptFileName}.out (${this.scriptJob.scriptJobId})`)
            await this._setProjectFile(`${scriptFileName}.out`, JSON.stringify(spaOutput))
        }

        let consoleOutput = ''
        let lastUpdateConsoleOutputTimestamp = Date.now()
        const updateConsoleOutput = async () => {
            lastUpdateConsoleOutputTimestamp = Date.now()
            await this._setScriptJobProperty('consoleOutput', consoleOutput)
        }
        try {
            await new Promise<void>((resolve, reject) => {
                let returned = false

                // const cmd = 'python'
                // const args = [scriptFileName]

                let cmd: string
                let args: string[]

                const containerMethod = this.config.computeResourceConfig.container_method

                const absScriptJobDir = path.resolve(scriptJobDir)

                if (containerMethod === 'singularity') {
                    cmd = 'singularity'
                    args = [
                        'exec',
                        '-C', // do not mount home directory, tmp directory, etc
                        '--pwd', '/working',
                        '--bind', `${absScriptJobDir}:/working`
                    ]
                    if (scriptFileName.endsWith('.py')) {
                        args = [...args, ...[
                            // '--cpus', '1', // limit CPU - having trouble with this - cgroups issue
                            // '--memory', '1G', // limit memory - for now disable because this option is not available on the FI cluster
                            'docker://jstoropoli/cmdstanpy',
                            'bash', 'run.sh'
                        ]]
                    }
                    else if (scriptFileName.endsWith('.spa')) {
                        args = [...args, ...[
                            // '--cpus', '4', // limit CPU - having trouble with this - cgroups issue
                            // '--memory', '4G', // limit memory - for now disable because this option is not available on the FI cluster
                            'docker://jstoropoli/cmdstanpy',
                            'bash', 'run.sh'
                        ]]
                    }
                    else {
                        throw Error(`Unsupported script file name: ${scriptFileName}`)
                    }
                }
                else if (containerMethod === 'docker') {
                    cmd = 'docker'
                    args = [
                        'run',
                        '--rm', // remove container after running
                        '-v', `${absScriptJobDir}:/working`,
                        '-w', '/working'
                    ]
                    if (scriptFileName.endsWith('.py')) {
                        args = [...args, ...[
                            '--cpus', '1', // limit CPU
                            '--memory', `${this.config.computeResourceConfig.max_ram_per_python_job_gb}g`, // limit memory
                            'jstoropoli/cmdstanpy',
                            '-c', `bash run.sh` // tricky - need to put the last two args together so that it ends up in a quoted argument
                        ]]
                    }
                    else if (scriptFileName.endsWith('.spa')) {
                        args = [...args, ...[
                            '--cpus', '4', // limit CPU
                            '--memory', `${this.config.computeResourceConfig.max_ram_per_spa_job_gb}g`, // limit memory
                            'jstoropoli/cmdstanpy',
                            '-c', 'bash run.sh' // tricky - need to put the last two args together so that it ends up in a quoted argument
                        ]]
                    }
                    else {
                        throw Error(`Unsupported script file name: ${scriptFileName}`)
                    }
                }
                else if (containerMethod === 'none') {
                    cmd = 'bash'
                    args = ['run.sh']
                }
                else {
                    throw Error(`Unsupported container: ${containerMethod}`)
                }

                console.info('EXECUTING:', `${cmd} ${args.join(' ')}`)

                let timeoutSec: number
                if (scriptFileName.endsWith('.py')) {
                    timeoutSec = 10
                }
                else if (scriptFileName.endsWith('.spa')) {
                    timeoutSec = 60 * 10
                }
                else {
                    throw Error(`Unsupported script file name: ${scriptFileName}`)
                }

                this.#childProcess = spawn(cmd, args, {
                    cwd: scriptJobDir
                })

                const timeoutId = setTimeout(() => {
                    if (returned) return
                    console.info(`Killing script job: ${this.scriptJob.scriptJobId} - ${this.scriptJob.scriptFileName} due to timeout`)
                    returned = true
                    this.#childProcess.kill()
                    reject(Error('Timeout'))
                }, timeoutSec * 1000)

                this.#childProcess.stdout.on('data', (data: any) => {
                    console.log(`stdout: ${data}`)
                    consoleOutput += data
                    if (Date.now() - lastUpdateConsoleOutputTimestamp > 10000) {
                        updateConsoleOutput()
                    }
                })
                this.#childProcess.stderr.on('data', (data: any) => {
                    console.error(`stderr: ${data}`)
                    consoleOutput += data
                    if (Date.now() - lastUpdateConsoleOutputTimestamp > 10000) {
                        updateConsoleOutput()
                    }
                })
                this.#childProcess.on('error', (error: any) => {
                    if (returned) return
                    returned = true
                    clearTimeout(timeoutId)
                    reject(error)
                })
                this.#childProcess.on('close', (code: any) => {
                    if (returned) return
                    returned = true
                    clearTimeout(timeoutId)
                    if (code !== 0) {
                        reject(Error(`Process exited with code ${code}`))
                    }
                    else {
                        resolve()
                    }
                })
            })
        }
        catch (err) {
            await updateConsoleOutput()
            await this._setScriptJobProperty('error', err.message)
            await this._setScriptJobProperty('status', 'failed')
            this.#status = 'failed'
            this.#onCompletedOrFailedCallbacks.forEach(cb => cb())
            return
        }
        await updateConsoleOutput()

        if (scriptFileName.endsWith('.spa')) {
            await uploadSpaOutput()
        }
        else {
            const outputFileNames: string[] = []
            const files = fs.readdirSync(scriptJobDir)
            for (const file of files) {
                if ((file !== scriptFileName) && (file !== 'run.sh')) {
                    // check whether it is a file
                    const stat = fs.statSync(path.join(scriptJobDir, file))
                    if (stat.isFile()) {
                        outputFileNames.push(file)
                    }
                }
            }
            const maxOutputFiles = 5
            if (outputFileNames.length > maxOutputFiles) {
                console.info('Too many output files.')
                await this._setScriptJobProperty('error', 'Too many output files.')
                await this._setScriptJobProperty('status', 'failed')
                this.#status = 'failed'
                this.#onCompletedOrFailedCallbacks.forEach(cb => cb())
                return
            }
            for (const outputFileName of outputFileNames) {
                console.info('Uploading output file: ' + outputFileName)
                const content = fs.readFileSync(path.join(scriptJobDir, outputFileName), 'utf8')
                await this._setProjectFile(outputFileName, content)
            }
        }

        await this._setScriptJobProperty('status', 'completed')
        this.#status = 'completed'

        this.#onCompletedOrFailedCallbacks.forEach(cb => cb())
    }
}

const createRunPyContent = (spaFileName: string): string => {
    return `import yaml
import time
import json
from cmdstanpy import CmdStanModel

with open('${spaFileName}', 'r') as f:
    spa = yaml.safe_load(f)

stan_file_name = spa['stan']
data_file_name = spa['data']
options = spa['options']

model = CmdStanModel(stan_file=stan_file_name)
with open(data_file_name, 'r') as f:
    data = json.load(f)

iter_sampling = options.get('iter_sampling', None)
iter_warmup = options.get('iter_warmup', None)
chains = options.get('chains', 4)
save_warmup = options.get('save_warmup', True)
seed = options.get('seed', None)

if iter_sampling is None:
    raise Exception('iter_sampling not specified in options')
if iter_warmup is None:
    raise Exception('iter_warmup not specified in options')

print('Starting sampling')
print(f'{time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())}')
print(f'====================')
timer = time.time()
fit = model.sample(
    data=data,
    output_dir='output',
    iter_sampling=iter_sampling,
    iter_warmup=iter_warmup,
    chains=chains,
    seed=seed,
    save_warmup=save_warmup,
    show_console=True
)
print(f'====================')
elapsed = time.time() - timer
print(f'Elapsed time: {elapsed} seconds')
print('Finished sampling')
`
}

const loadSpaOutput = async (outputDir: string): Promise<SpaOutput> => {
    // find the .csv files in the output directory
    const csvFiles: string[] = []
    const files = fs.readdirSync(outputDir)
    for (const file of files) {
        if (file.endsWith('.csv')) {
            csvFiles.push(file)
        }
    }

    const ret: SpaOutput = {
        chains: []
    }

    for (const csvFile of csvFiles) {
        const chainId = csvFile.replace('.csv', '')
        const cf = new ChainFile(path.join(outputDir, csvFile), chainId)
        await cf.update()
        const sequences: {[key: string]: number[]} = {}
        for (const vname of cf.variableNames) {
            sequences[vname] = cf.sequenceData(vname, 0)
        }
        ret.chains.push({
            chainId,
            rawHeader: cf.rawHeader || '',
            rawFooter: cf.rawFooter,
            numWarmupDraws: cf.excludedInitialIterationCount,
            sequences,
            variablePrefixesExcluded: cf.variablePrefixesExcluded
        })
    }

    return ret
}

export default ScriptJobManager