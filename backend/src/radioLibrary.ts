export type RadioGenre = {
  id: string;
  name: string;
};

export type RadioStation = {
  id: string;
  name: string;
  uri: string;
  image: string | null;
  provider: string | null;
  favorite: boolean;
  genres: RadioGenre[];
};

export function normalizeRadioLibrary(items: any[]): RadioStation[] {
  return items
    .map((item: any) => ({
      id: String(item?.item_id ?? item?.id ?? item?.uri ?? ""),
      name: item?.name ?? "Radiostation",
      uri: typeof item?.uri === "string" ? item.uri : "",
      image: item?.image?.path ?? item?.metadata?.images?.[0]?.path ?? null,
      provider: item?.provider ?? null,
      favorite: item?.favorite === true,
      genres: [],
    }))
    .filter((station: RadioStation) => station.uri.startsWith("library://radio/"))
    .sort((a: RadioStation, b: RadioStation) => a.name.localeCompare(b.name, "sv"));
}

export function normalizeRadioGenres(items: any[]): RadioGenre[] {
  return items
    .map((item: any) => ({
      id: String(item?.item_id ?? item?.id ?? ""),
      name: String(item?.name ?? "").trim(),
    }))
    .filter((genre: RadioGenre) => genre.id.length > 0 && genre.name.length > 0)
    .sort((a: RadioGenre, b: RadioGenre) => a.name.localeCompare(b.name, "sv"));
}
