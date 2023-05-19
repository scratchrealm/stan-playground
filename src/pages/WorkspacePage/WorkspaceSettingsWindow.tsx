import { FunctionComponent, useCallback } from "react";
import { confirm } from "../../confirm_prompt_alert";
import useRoute from "../../useRoute";
import { useWorkspace } from "./WorkspacePageContext";
import WorkspaceUsersComponent from "./WorkspaceUsersComponent";

type Props = {
    // none
}

const WorkspaceSettingsWindow: FunctionComponent<Props> = () => {
    const {workspaceId} = useWorkspace()

    return (
        <div>
            <h3>Workspace Settings</h3>
            <div>Workspace ID: {workspaceId}</div>
            <hr />
            <WorkspaceUsersComponent />
            <hr />
            <DeleteWorkspaceButton />
        </div>
    )
}

const DeleteWorkspaceButton: FunctionComponent = () => {
    const {deleteWorkspace} = useWorkspace()
    const {setRoute} = useRoute()
    const handleDeleteWorkspace = useCallback(async () => {
        const okay = await confirm('Are you sure you want to delete this workspace?')
        if (!okay) return
        await deleteWorkspace()
        setRoute({page: 'home'})
    }, [deleteWorkspace, setRoute])

    return (
        <button onClick={handleDeleteWorkspace}>Delete workspace</button>
    )
}

export default WorkspaceSettingsWindow;