import type {SyncMechanism} from '../src/data.ts';

export type SnapshotReuseInput={
 mechanism:SyncMechanism|undefined;
 priorMechanism?:SyncMechanism;
 ledgerAvailable:boolean;
 source:string|undefined;
 snapshotAt:string|undefined;
 now:string;
 dayBoundary:boolean;
 forceSweep:boolean;
};

/** Only one situation may reuse Xbox data:
 * a Cloudflare :17 hourly job following a completed MANUAL scan begun during
 * the 5 minutes preceding the scheduled :17 tick.
 *
 * Compare with the SCHEDULED tick, not runner start: GitHub queue/build time
 * can delay actual processing. Never treat a manual run after :17 as preceding
 * that tick. Do not reuse for manual, code-update or boundary-triggered syncs.
 */
export function shouldReuseRecentXboxSnapshot(input:SnapshotReuseInput):boolean{
 if(input.mechanism!=='cloudflare'||input.priorMechanism!=='manual'||
    !input.ledgerAvailable||input.source!=='Xbox'||input.dayBoundary||input.forceSweep||
    !input.snapshotAt)return false;
 const now=Date.parse(input.now),prior=Date.parse(input.snapshotAt);
 if(!Number.isFinite(now)||!Number.isFinite(prior))return false;
 const scheduled=new Date(now);
 scheduled.setUTCMinutes(17,0,0);
 if(scheduled.getTime()>now)scheduled.setUTCHours(scheduled.getUTCHours()-1);
 const tick=scheduled.getTime();
 // We only associate jobs with the :17 tick shortly after that tick.
 if(now-tick>15*60_000)return false;
 return prior<=tick&&tick-prior<=5*60_000;
}
