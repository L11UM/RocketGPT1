document.querySelectorAll('button[data-share-url]').forEach((button) => {
  const status = button.parentElement.querySelector('.share-status');

  button.addEventListener('click', async () => {
    const { shareTitle: title, shareText: text, shareUrl: url } = button.dataset;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard sharing is unavailable in this browser.');
      }
      await navigator.clipboard.writeText(url);
      status.textContent = 'Story link copied.';
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Could not share the blog story.', error);
        status.textContent = 'Sharing failed. Please try again.';
      }
    }
  });
});
