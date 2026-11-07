import type {SyncMechanism} from '../src/data.ts';

/**
 * Short-circuit only an optional near-duplicate sync. An hourly Cloudflare
 * tick must scan Microsoft even if the user just synced manually: otherwise
 * the tick silently republishes an old record without a new history entry.
 */
export function shouldReuseRecentXboxSnapshot(input:{
 mechanism:SyncMechanism|undefined;
 ledgerAvailable:boolean;
 source:string|undefined;
 snapshotAt:string|undefined;
 now:string;
 dayBoundary:boolean;
 forceSweep:boolean;
}):boolean{
 if(input.mechanism==='cloudflare'||input.mechanism==='day-boundary')return false;
 if(!input.ledgerAvailable||input.source!=='Xbox'||input.dayBoundary||input.forceSweep||!input.snapshotAt)return false;
 const gap=Date.parse(input.now)-Date.parse(input.snapshotAt);
 return Number.isFinite(gap)&&gap>=0&&gap<20*60_000;
}
