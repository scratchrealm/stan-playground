import { AppBar, Toolbar } from "@mui/material";
import { FunctionComponent, useCallback, useMemo, useState } from "react";
import ModalWindow from "./components/ModalWindow/ModalWindow";
import GitHubLoginWindow from "./GitHub/GitHubLoginWindow";
import GitHubAccessControl from "./GitHubAccessControl/GitHubAccessControl";
import { useGithubAuth } from "./GithubAuth/useGithubAuth";
import useRoute from "./useRoute";

type Props = {
    // none
}

export const applicationBarHeight = 50

const ApplicationBar: FunctionComponent<Props> = () => {
    const {signedIn, userId} = useGithubAuth()
    const {setRoute} = useRoute()

    const onHome = useCallback(() => {
        setRoute({page: 'home'})
    }, [setRoute])

    const {visible: githubAccessWindowVisible, handleOpen: openGitHubAccessWindow, handleClose: closeGitHubAccessWindow} = useModalDialog()

    return (
        <span>
            <AppBar position="static" style={{height: applicationBarHeight - 10, color: 'white', background: '#e09050'}}>
                <Toolbar style={{minHeight: applicationBarHeight - 10}}>
                    <img src="/vite.svg" alt="logo" height={30} style={{paddingBottom: 5, cursor: 'pointer'}} onClick={onHome} />
                    <div>&nbsp;&nbsp;&nbsp;Stan Playground</div>
                    <span style={{marginLeft: 'auto'}} />
                    {
                        signedIn && (
                            <span style={{fontFamily: 'courier', color: 'lightgray', cursor: 'pointer'}} title={`Signed in as ${userId}`}>{userId}&nbsp;&nbsp;</span>
                        )
                    }
                    <span style={{paddingBottom: 0, color: 'white'}} title={signedIn ? "Manage GitHub sign in" : "Sign in with GitHub"}>
                        <GitHubAccessControl onOpen={openGitHubAccessWindow} />
                        &nbsp;
                    </span>
                </Toolbar>
            </AppBar>
            <ModalWindow
                open={githubAccessWindowVisible}
                onClose={closeGitHubAccessWindow}
            >
                <GitHubLoginWindow
                    defaultScope=""
                    onClose={() => closeGitHubAccessWindow()} onChange={() => {}}
                />
            </ModalWindow>
        </span>
    )
}

export const useModalDialog = () => {
    const [visible, setVisible] = useState<boolean>(false)
    const handleOpen = useCallback(() => {
        setVisible(true)
    }, [])
    const handleClose = useCallback(() => {
        setVisible(false)
    }, [])
    return useMemo(() => ({
        visible,
        handleOpen,
        handleClose
    }), [visible, handleOpen, handleClose])
}

export default ApplicationBar