import { ChonkyActions, ChonkyFileActionData, FileArray, FileBrowser as ChonkyFileBrowser, FileList } from 'chonky';
import { FunctionComponent, useCallback, useMemo } from "react";
import { SPAnalysisFile } from '../../../types/stan-playground-types';
import { useAnalysis } from '../AnalysisPageContext';

type Props = {
    analysisFiles: SPAnalysisFile[] | undefined
    onOpenFile: (path: string) => void
    // currentFolderPath: string
    // setCurrentFolderPath: (path: string) => void
}

const AnalysisFileBrowser: FunctionComponent<Props> = ({onOpenFile, analysisFiles}) => {
    // const {analysisId} = useAnalysis()

    const {currentTabName} = useAnalysis()

    // const [files, setFiles] = useState<FileArray>([])

    const folderChain: FileArray = useMemo(() => {
        const ret: FileArray = []
        ret.push({id: '/', name: 'root', isDir: true})
        return ret
    }, [])

    // const {accessToken, userId} = useGithubAuth()
    // const auth = useMemo(() => (accessToken ? {githubAccessToken: accessToken, userId} : {}), [accessToken, userId])

    // useEffect(() => {
    //     setFiles([])
    //     let canceled = false
    //     ;(async () => {
    //         if (!analysisId) return
    //         const analysisFiles = await fetchAnalysisFiles(analysisId, auth)
    //         if (canceled) return
    //         const ff: FileArray = []
    //         for (const x of analysisFiles) {
    //             ff.push({
    //                 id: x.fileName,
    //                 name: x.fileName,
    //                 isDir: false
    //             })
    //         }
    //         setFiles(ff)
    //     })()
    //     return () => {canceled = true}
    // }, [analysisId, auth])

    const files = useMemo(() => {
        const ret: FileArray = []
        for (const x of analysisFiles || []) {
            ret.push({
                id: x.fileName,
                name: x.fileName,
                color: 'file:' + x.fileName === currentTabName ? 'red' : undefined,
                isDir: false,
                size: x.contentSize,
                modDate: new Date(x.timestampModified * 1000)
            })
        }
        return ret
    }, [analysisFiles, currentTabName])

    const handleFileAction = useCallback((data: ChonkyFileActionData) => {
        if (data.id === ChonkyActions.OpenFiles.id) {
            // open a file (like in the folder chain)
            const { targetFile, files } = data.payload;
            const fileToOpen = targetFile ?? files[0];
            if (fileToOpen) {
                if (fileToOpen.isDir) {
                    // setCurrentFolderPath(fileToOpen.id === '/' ? '' : fileToOpen.id)
                }
                else {
                    onOpenFile(fileToOpen.id)
                }
            }
        }
        else if (data.id === ChonkyActions.MouseClickFile.id) {
            // single click a file
            const { file: fileToOpen } = data.payload;
            if (fileToOpen) {
                if (fileToOpen.isDir) {
                    // setCurrentFolderPath(fileToOpen.id === '/' ? '' : fileToOpen.id)
                }
                else {
                    onOpenFile(fileToOpen.id)
                }
            }
        }
    }, [onOpenFile])
    
    return (
        <ChonkyFileBrowser
            files={files}
            folderChain={folderChain}
            defaultFileViewActionId={ChonkyActions.EnableListView.id}
            onFileAction={handleFileAction}
            disableSelection={true}
        >
            {/* <FileNavbar /> */}
            {/* <FileToolbar /> */}
            <FileList />
        </ChonkyFileBrowser>
    )
}

export default AnalysisFileBrowser