(() => {
  const dialog = document.getElementById('productPreview');
  const title = document.getElementById('previewTitle');
  const image = document.getElementById('previewImage');
  const closeButton = dialog.querySelector('.product-preview-close');

  document.querySelectorAll('.product-preview-trigger').forEach((button) => {
    button.addEventListener('click', () => {
      title.textContent = button.dataset.productTitle;
      image.src = button.dataset.productImage;
      image.alt = button.dataset.productAlt;
      dialog.showModal();
    });
  });

  closeButton.addEventListener('click', () => dialog.close());
})();
