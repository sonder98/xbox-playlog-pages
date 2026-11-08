/** A tiny public marker lets open pages avoid repeatedly downloading a 28MB vault.
 * Unknown/legacy status formats fall back to the full encrypted archive. */
export function publishedSnapshotNewer(status:unknown,currentAt:string):boolean|null{
 if(!status||typeof status!=='object'||!('latestAt' in status))return null;
 const latestAt=(status as {latestAt?:unknown}).latestAt;
 if(typeof latestAt!=='string')return null;
 const remote=Date.parse(latestAt),local=Date.parse(currentAt);
 return Number.isFinite(remote)&&Number.isFinite(local)?remote>local:null;
}

/** A cached startup older than an hourly Xbox sync must verify the encrypted
 * vault itself once. A stale status.json must never hide hours of new data.
 * Recent cached startups still use the cheap 58-byte status marker. */
export function cachedSnapshotNeedsFullCheck(latestAt:string,now=Date.now()):boolean{
 const at=Date.parse(latestAt);
 return !Number.isFinite(at)||now-at>=70*60_000;
}
