import { useContext, useEffect, useRef } from 'react'
import { SimulationContext } from '@/context/SimulationProvider'

export function useSimulation() {
  const ctx = useContext(SimulationContext)
  if (!ctx) throw new Error('useSimulation must be used within SimulationProvider')
  return ctx
}

export function useEventBus<T = unknown>(
  event: string,
  handler: (data: T) => void,
  deps: unknown[] = []
) {
  const { bus } = useSimulation()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const wrapped = (data: T) => handlerRef.current(data)
    bus.on(event, wrapped)
    return () => bus.off(event, wrapped)
  }, [bus, event, ...deps])
}
