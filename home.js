const shareButton = document.getElementById('shareRocket');
    const shareStatus = document.getElementById('shareStatus');
    shareButton.addEventListener('click', async () => {
      const shareData = {
        title: 'Rocket 2.0 — Turn ideas into attention',
        text: 'Try Rocket 2.0, a task-based code and natural language processing tool—not a chatbot.',
        url: 'https://rocketgpt.net/'
      };
      try {
        if (navigator.share) {
          await navigator.share(shareData);
          shareStatus.textContent = 'Ready to share Rocket 2.0.';
          return;
        }
        await navigator.clipboard.writeText(shareData.url);
        shareStatus.textContent = 'Rocket 2.0 link copied. Send it to a friend.';
      } catch (error) {
        if (error.name !== 'AbortError') shareStatus.textContent = 'Sharing is unavailable in this browser.';
      }
    });
