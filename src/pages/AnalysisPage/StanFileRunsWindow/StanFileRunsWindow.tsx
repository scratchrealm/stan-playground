import { FunctionComponent } from "react";
import { useWorkspace } from "../../WorkspacePage/WorkspacePageContext";
import CreateRunComponent from "./CreateRunComponent";
import StanFileRunsTable from "./StanFileRunsTable";

type Props = {
    width: number,
    height: number,
    fileName: string
}

const StanFileRunsWindow: FunctionComponent<Props> = ({ width, height, fileName }) => {
    const {workspaceRole, workspace} = useWorkspace()
    return (
        <>
            {
                (workspaceRole === 'admin' || workspaceRole === 'editor') ? (
                    workspace?.computeResourceId ? (
                        <CreateRunComponent
                            stanFileName={fileName}
                        />
                    ) : (
                        <p>You must set a compute resource for this workspace before you can create analysis runs.</p>
                    )
                ) : (
                    <p>You do not have permission to create analysis runs for this analysis.</p>
                )
            }
            <StanFileRunsTable
                fileName={fileName}
            />
        </>
    )
}

export default StanFileRunsWindow