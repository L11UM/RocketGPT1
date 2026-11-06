(() => {
      const form = document.getElementById('promptForm');
      const promptInput = document.getElementById('prompt');
      const preview = document.getElementById('promptPreview');
      const stage = document.getElementById('stage');
      const stageRatio = document.getElementById('stageRatio');
      const stageTitle = document.getElementById('stageTitle');
      const stageLabel = document.getElementById('stageLabel');
      const stageNote = document.getElementById('stageNote');
      const generateButton = document.getElementById('generateButton');
      const generationStatus = document.getElementById('generationStatus');
      const generatedImage = document.getElementById('generatedImage');
      const downloadButton = document.getElementById('downloadButton');
      const ratioButtons = Array.from(document.querySelectorAll('.ratio-button'));
      const sampleButton = document.getElementById('samplePrompt');
      const stylePreset = document.getElementById('stylePreset');
      const imageGallery = document.getElementById('imageGallery');
      const galleryEmpty = document.getElementById('galleryEmpty');
      const ratios = {
        square: { label: '1:1', width: 1024, height: 1024 },
        portrait: { label: '2:3', width: 1024, height: 1536 },
        landscape: { label: '3:2', width: 1536, height: 1024 }
      };
      const galleryItems = [];
      let generatedObjectUrl = '';

      function setStatus(message, state = '') {
        generationStatus.textContent = message;
        generationStatus.dataset.state = state;
      }

      function imageExtension(blob) {
        return blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
      }

      function shareUrlFor(item) {
        const url = new URL(window.location.href);
        url.search = '';
        url.searchParams.set('prompt', item.basePrompt);
        url.searchParams.set('ratio', item.ratio);
        if (item.stylePreset) url.searchParams.set('style', item.stylePreset);
        return url.toString();
      }

      function setGalleryStatus(status, message) {
        status.textContent = message;
      }

      async function shareGalleryItem(item, status) {
        const url = shareUrlFor(item);
        const text = `A NALL-E image prompt: ${item.prompt}`;
        try {
          if (navigator.share && navigator.canShare && typeof File === 'function') {
            const file = new File([item.blob], `nall-e-image.${imageExtension(item.blob)}`, { type: item.blob.type });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: 'NALL-E image', text, url });
              setGalleryStatus(status, 'Image shared.');
              return;
            }
          }
          if (navigator.share) {
            await navigator.share({ title: 'NALL-E prompt', text, url });
            setGalleryStatus(status, 'Prompt shared. Download the image to send the artwork.');
            return;
          }
          if (!navigator.clipboard?.writeText) throw new Error('Clipboard sharing is unavailable.');
          await navigator.clipboard.writeText(`${text}\n${url}`);
          setGalleryStatus(status, 'Prompt link copied. Download the image to share the artwork.');
        } catch (error) {
          if (error.name !== 'AbortError') setGalleryStatus(status, 'Sharing is unavailable. You can still download the image.');
        }
      }

      function addGalleryItem(item) {
        const card = document.createElement('article');
        const image = document.createElement('img');
        const content = document.createElement('div');
        const promptText = document.createElement('p');
        const actions = document.createElement('div');
        const download = document.createElement('a');
        const share = document.createElement('button');
        const remix = document.createElement('button');
        const status = document.createElement('p');
        card.className = 'gallery-card';
        image.src = item.url;
        image.alt = `NALL-E generated image: ${item.prompt}`;
        image.loading = 'lazy';
        content.className = 'gallery-card-content';
        promptText.className = 'gallery-card-prompt';
        promptText.textContent = item.prompt;
        actions.className = 'gallery-card-actions';
        download.href = item.url;
        download.download = `nall-e-image.${imageExtension(item.blob)}`;
        download.textContent = 'Download';
        share.type = 'button';
        share.textContent = 'Share';
        share.addEventListener('click', () => shareGalleryItem(item, status));
        remix.type = 'button';
        remix.textContent = 'Remix prompt';
        remix.addEventListener('click', () => {
          promptInput.value = item.basePrompt;
          stylePreset.value = item.stylePreset;
          ratioButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.ratio === item.ratio)));
          stage.dataset.ratio = item.ratio;
          stageRatio.textContent = ratios[item.ratio].label;
          promptInput.focus();
          setStatus('Prompt remixed. Adjust it or generate again.');
        });
        status.className = 'gallery-card-status';
        status.setAttribute('role', 'status');
        actions.append(download, share, remix);
        content.append(promptText, actions, status);
        card.append(image, content);
        galleryItems.unshift({ ...item, card });
        galleryEmpty.hidden = true;
        imageGallery.prepend(card);
        while (galleryItems.length > 4) {
          const removed = galleryItems.pop();
          removed.card.remove();
          URL.revokeObjectURL(removed.url);
        }
      }

      async function generateImage(prompt, basePrompt) {
        const selectedRatio = ratioButtons.find((button) => button.getAttribute('aria-pressed') === 'true')?.dataset.ratio || 'square';
        const dimensions = ratios[selectedRatio];
        const selectedStyle = stylePreset.value;

        generateButton.disabled = true;
        generateButton.textContent = 'Generating…';
        setStatus('Generating your image. This can take a little while.');
        preview.textContent = prompt;
        stageTitle.textContent = 'CREATING YOUR IMAGE';
        stageLabel.textContent = 'Generating image…';
        stageNote.textContent = 'The image is generated by Pollinations from the prompt you provided.';

        try {
          const imageUrl = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
          imageUrl.searchParams.set('width', String(dimensions.width));
          imageUrl.searchParams.set('height', String(dimensions.height));
          imageUrl.searchParams.set('nologo', 'true');
          const response = await fetch(imageUrl, {
            signal: AbortSignal.timeout(180_000)
          });
          if (!response.ok) {
            if (response.status === 402 || response.status === 429) {
              throw new Error('The free image service is busy or has reached its limit. Please wait a while and try again.');
            }
            throw new Error(`Image generation failed (HTTP ${response.status}). Please try again later.`);
          }

          const imageBlob = await response.blob();
          if (!imageBlob.type.startsWith('image/')) {
            throw new Error('The image service returned an unexpected response. Please try again later.');
          }

          generatedObjectUrl = URL.createObjectURL(imageBlob);
          generatedImage.src = generatedObjectUrl;
          generatedImage.alt = `AI-generated image: ${prompt}`;
          downloadButton.href = generatedObjectUrl;
          downloadButton.download = `nall-e-image.${imageExtension(imageBlob)}`;
          downloadButton.hidden = false;
          stage.dataset.ratio = selectedRatio;
          stageRatio.textContent = dimensions.label;
          stage.classList.add('has-image');
          stageTitle.textContent = 'YOUR IMAGE IS READY';
          stageLabel.textContent = 'Generated image';
          addGalleryItem({
            blob: imageBlob,
            url: generatedObjectUrl,
            prompt,
            basePrompt,
            ratio: selectedRatio,
            stylePreset: selectedStyle
          });
          setStatus('Image generated with Pollinations. Download, share, or remix it below.');
        } catch (error) {
          const message = error.name === 'TimeoutError'
            ? 'Image generation took too long. Please try again.'
            : error.name === 'TypeError'
              ? 'Could not reach the image service. Check your connection and try again.'
              : error.message;
          setStatus(message, 'error');
          stageTitle.textContent = 'IMAGE GENERATION DID NOT FINISH';
          const hasPreviousImage = stage.classList.contains('has-image');
          stageLabel.textContent = hasPreviousImage ? 'Previous image kept' : 'Generation failed';
          stageNote.textContent = hasPreviousImage
            ? 'Your last successful image is still shown. Check the message beside the prompt before trying again.'
            : 'Check the message beside the prompt for details. The public image service may be busy, rate-limited, or unavailable.';
        } finally {
          generateButton.disabled = false;
          generateButton.textContent = 'Generate image';
        }
      }

      function showPrompt() {
        const prompt = promptInput.value.trim();
        if (!prompt) {
          promptInput.focus();
          return;
        }
        const selectedStyle = stylePreset.value;
        generateImage(selectedStyle ? `${prompt}, ${selectedStyle}` : prompt, prompt);
      }

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        showPrompt();
      });

      ratioButtons.forEach((button) => {
        button.addEventListener('click', () => {
          ratioButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
          stage.dataset.ratio = button.dataset.ratio;
          stageRatio.textContent = ratios[button.dataset.ratio].label;
        });
      });

      sampleButton.addEventListener('click', () => {
        promptInput.value = 'A tiny observatory on a quiet moon, looking toward a blue sunrise, cinematic illustration';
        stylePreset.value = '';
        promptInput.focus();
      });

      const sharedParams = new URLSearchParams(window.location.search);
      if (sharedParams.has('prompt')) promptInput.value = sharedParams.get('prompt').slice(0, 500);
      if (sharedParams.has('style') && Array.from(stylePreset.options).some((option) => option.value === sharedParams.get('style'))) {
        stylePreset.value = sharedParams.get('style');
      }
      if (sharedParams.has('ratio') && ratios[sharedParams.get('ratio')]) {
        const selectedRatio = sharedParams.get('ratio');
        ratioButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.ratio === selectedRatio)));
        stage.dataset.ratio = selectedRatio;
        stageRatio.textContent = ratios[selectedRatio].label;
      }

      window.addEventListener('pagehide', () => {
        galleryItems.forEach((item) => URL.revokeObjectURL(item.url));
      });
    })();
