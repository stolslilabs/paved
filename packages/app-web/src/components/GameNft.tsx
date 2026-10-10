import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { NftMetadataError, RpcCollectionViews, collectionAddress, nftLabel, parseTokenUri, useAsyncRead, useIndexerRead, usePaved } from "@paved/chain";
import type { CollectionViews, NftMetadata } from "@paved/chain";

const NftViewsContext = createContext<CollectionViews | null>(null);

/** Replaces the Collection reads of the screens (tests: `FakeCollectionViews`). Without it they call the contract. */
export function NftViewsProvider({ views, children }: { views: CollectionViews; children: ReactNode }) {
  return <NftViewsContext.Provider value={views}>{children}</NftViewsContext.Provider>;
}

export interface Collection {
  address: string | null;
  views: CollectionViews | null;
}

/**
 * The Collection of the build: `VITE_COLLECTION_ADDRESS`, else the deployments file's `contracts.Collection`, else the
 * indexer's `/v1/head` `contracts.collection` (read only when the first two are unset). Null when neither is known, and then the
 * screens show no NFT at all. `enabled` false asks the indexer nothing (a page that shows no games). A page reads it once and hands it to each `GameNft`. `views` is null without an address or without a client to call it through.
 */
export function useCollection(enabled = true): Collection {
  const { deployment, client } = usePaved();
  const override = useContext(NftViewsContext);
  const head = useIndexerRead(enabled && !collectionAddress(deployment) ? (c) => c.head() : null, []);
  const address = collectionAddress(deployment, head.data?.data.contracts.collection ?? null);
  const provider = client?.provider;
  const views = useMemo(() => override ?? (address && provider ? new RpcCollectionViews(provider, address) : null), [override, address, provider]);
  return { address, views };
}

const button = { border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)", color: "#fff", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 12 } as const;

/** A blob URL of the JSON text, revoked when the text changes or the component goes; null where the browser has no blob URLs. */
function useJsonUrl(json: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (json === null || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      setUrl(null);
      return;
    }
    let made: string | null = null;
    try {
      made = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    } catch {
      made = null;
    }
    setUrl(made);
    return () => {
      if (made && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(made);
    };
  }, [json]);
  return url;
}

/**
 * A game's NFT: "NFT: <short collection address> #<token id>" and a "Metadata" toggle that reads `token_uri` and prints
 * the JSON as text. Everything the token says reaches the page as a React text child: the JSON is data, never markup.
 * Nothing is shown (not an error) while the Collection is unknown or the game has no token id.
 */
export function GameNft({ tokenId, collection, verify = false }: { tokenId: bigint | null; collection: Collection; verify?: boolean }) {
  const { address, views } = collection;
  if (!address || tokenId === null) return null;
  if (verify) return views ? <Verified tokenId={tokenId} address={address} views={views} /> : null;
  return <NftBox tokenId={tokenId} address={address} views={views} />;
}

/** A token id computed by rule, not read from a row: shown only once `owner_of` says it exists (one call); any failure shows nothing. */
function Verified({ tokenId, address, views }: { tokenId: bigint; address: string; views: CollectionViews }) {
  const id = tokenId.toString();
  const owner = useAsyncRead(() => views.ownerOf(tokenId), [views, id]);
  if (!owner.data) return null;
  return <NftBox tokenId={tokenId} address={address} views={views} />;
}

function NftBox({ tokenId, address, views }: { tokenId: bigint; address: string; views: CollectionViews | null }) {
  return (
    <div data-testid="game-nft" style={{ fontSize: 12, color: "#d4d4d4", display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span title={address}>{nftLabel(address, tokenId)}</span>
        {views && <NftMetadata views={views} tokenId={tokenId} />}
      </span>
    </div>
  );
}

function NftMetadata({ views, tokenId }: { views: CollectionViews; tokenId: bigint }) {
  const [open, setOpen] = useState(false);
  const id = tokenId.toString();
  const uri = useAsyncRead(open ? () => views.tokenUri(tokenId) : null, [views, id]);
  const parsed = useMemo<{ metadata: NftMetadata } | { error: string } | null>(() => {
    if (uri.data === null) return null;
    try {
      return { metadata: parseTokenUri(uri.data) };
    } catch (error) {
      return { error: error instanceof NftMetadataError ? error.message : "token_uri cannot be read" };
    }
  }, [uri.data]);
  const metadata = parsed && "metadata" in parsed ? parsed.metadata : null;
  const rawUrl = useJsonUrl(metadata?.json ?? null);

  return (
    <>
      <button type="button" style={button} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Metadata
      </button>
      {open && (
        <div data-testid="nft-metadata" style={{ flexBasis: "100%", background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: 8 }}>
          {uri.loading && !uri.data ? (
            <div role="status">Reading metadata…</div>
          ) : uri.error && !uri.data ? (
            <div role="alert">
              {"Metadata unavailable. "}
              <button type="button" style={button} onClick={uri.refresh}>
                Retry
              </button>
            </div>
          ) : parsed && "error" in parsed ? (
            <div role="alert">{`Metadata unreadable: ${parsed.error}`}</div>
          ) : metadata ? (
            <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "2px 12px", margin: 0 }}>
              <dt style={{ color: "#999" }}>Name</dt>
              <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{metadata.name ?? "–"}</dd>
              <dt style={{ color: "#999" }}>Description</dt>
              <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{metadata.description ?? "–"}</dd>
              {metadata.attributes.map((a, i) => (
                <AttributeRow key={i} traitType={a.traitType} value={a.value} />
              ))}
            </dl>
          ) : null}
          {rawUrl && (
            <a href={rawUrl} download={`paved-game-${id}.json`} target="_blank" rel="noopener noreferrer" style={{ color: "#f59e0b" }}>
              Raw JSON
            </a>
          )}
        </div>
      )}
    </>
  );
}

function AttributeRow({ traitType, value }: { traitType: string; value: string }) {
  return (
    <>
      <dt style={{ color: "#999", overflowWrap: "anywhere" }}>{traitType}</dt>
      <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{value}</dd>
    </>
  );
}
