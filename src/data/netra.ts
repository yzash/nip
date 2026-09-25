// The seam between the prototype and Netra.
//
// Today every entity is a static JSON file under /data produced by generate.py.
// In Phase 1 the same interface is implemented against Netra APIs (or a warehouse
// extract), and nothing above this file changes (PRD §12, "thin in-memory query layer").

export interface DataSource {
  readonly name: string
  fetchEntity<T>(entity: string): Promise<T>
}

export class StaticJsonSource implements DataSource {
  readonly name = 'Synthetic (generate.py)'
  constructor(private base = '/data') {}
  async fetchEntity<T>(entity: string): Promise<T> {
    const res = await fetch(`${this.base}/${entity}.json`)
    if (!res.ok) throw new Error(`Failed to load ${entity}: ${res.status}`)
    return (await res.json()) as T
  }
}

// Phase 1 placeholder: same contract, pointed at Netra.
export class NetraApiSource implements DataSource {
  readonly name = 'Netra API'
  constructor(private baseUrl: string, private token: () => string) {}
  async fetchEntity<T>(entity: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}/nicc/v1/${entity}`, {
      headers: { Authorization: `Bearer ${this.token()}` },
    })
    if (!res.ok) throw new Error(`Netra ${entity}: ${res.status}`)
    return (await res.json()) as T
  }
}

export const source: DataSource = new StaticJsonSource()
