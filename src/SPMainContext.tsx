import React, { useCallback, useEffect, useMemo } from 'react';
import { createWorkspace, fetchWorkspaces } from './dbInterface/dbInterface';
import { useGithubAuth } from './GithubAuth/useGithubAuth';
import { SPWorkspace } from './types/stan-playground-types';


type SPMainContextType = {
    workspaces: SPWorkspace[]
    createWorkspace: (workspaceName: string) => Promise<string>
    refreshWorkspaces: () => void
}

const SPMainContext = React.createContext<SPMainContextType>({workspaces: [], createWorkspace: async () => {}, refreshWorkspaces: () => {}})

export const SetupSPMain = (props: {children: React.ReactNode}) => {
    const [workspaces, setWorkspaces] = React.useState<SPWorkspace[]>([])
    const [refreshCode, setRefreshCode] = React.useState(0)
    const refreshWorkspaces = useCallback(() => setRefreshCode(rc => rc + 1), [])

    const {accessToken, userId} = useGithubAuth()
    const auth = useMemo(() => (accessToken ? {githubAccessToken: accessToken, userId} : {}), [accessToken, userId])

    const createWorkspaceHandler = useCallback(async (workspaceName: string) => {
        if (!auth) {
            console.warn('Not logged in.')
            return
        }
        const newWorkspaceId = await createWorkspace(workspaceName, auth)
        setRefreshCode(rc => rc + 1)
        return newWorkspaceId
    }, [auth])

    useEffect(() => {
        (async () => {
            setWorkspaces([])
            const workspaces = await fetchWorkspaces(auth)
            setWorkspaces(workspaces)
        })()
    }, [refreshCode, auth])

    const value = React.useMemo(() => ({
        workspaces,
        createWorkspace: createWorkspaceHandler,
        refreshWorkspaces
    }), [workspaces, createWorkspaceHandler])

    return (
        <SPMainContext.Provider value={value}>
            {props.children}
        </SPMainContext.Provider>
    )
}

export const useSPMain = () => {
    const context = React.useContext(SPMainContext)
    return {
        workspaces: context.workspaces,
        createWorkspace: context.createWorkspace,
        refreshWorkspaces: context.refreshWorkspaces
    }
}