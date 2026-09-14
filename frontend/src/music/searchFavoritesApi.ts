export async function addSearchAlbumToFavorites(query: string, uri: string) {
  const response = await fetch("/api/music/search/albums/favorite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, uri }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json();
}
