/** A tiny public marker lets open pages avoid repeatedly downloading a 28MB vault.
 * Unknown/legacy status formats fall back to the full encrypted archive. */
export function publishedSnapshotNewer(status:unknown,currentAt:string):boolean|null{
 if(!status||typeof status!=='object'||!('latestAt' in status))return null;
 const latestAt=(status as {latestAt?:unknown}).latestAt;
 if(typeof latestAt!=='string')return null;
 const remote=Date.parse(latestAt),local=Date.parse(currentAt);
 return Number.isFinite(remote)&&Number.isFinite(local)?remote>local:null;
}
