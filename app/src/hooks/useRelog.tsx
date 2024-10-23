import { useMemo } from "react"

export const useRelog = () => {
    const publicVersion = parseInt(import.meta.env.VITE_PUBLIC_GAME_VERSION)
    const localVersion = parseInt(localStorage.getItem("version") ?? "0")

    const isOutdated = useMemo(() => localVersion < publicVersion, [localVersion, publicVersion])

    const updateStoredVersion = () => {
        !localVersion && localStorage.setItem("version", import.meta.env.VITE_PUBLIC_GAME_VERSION)
    }

    const clearStoredVersion = () => {
        localStorage.removeItem("version")
    }

    return {
        isOutdated,
        updateStoredVersion,
        clearStoredVersion
    }
}