// Serialize updates so each updater sees only the latest successfully persisted data.
export function createSaveQueue({ read, write, commit, onError }) {
  let pending = Promise.resolve()
  return (updater) => {
    const operation = pending.then(async () => {
      try {
        const current = read()
        if (!current) throw new Error('Local data has not finished loading yet. Please try again.')
        const next = typeof updater === 'function' ? updater(current) : updater
        await write(next)
        commit(next)
        return true
      } catch (error) {
        onError(error instanceof Error ? error : new Error('Your browser could not save local data.'))
        return false
      }
    })
    pending = operation
    return operation
  }
}
