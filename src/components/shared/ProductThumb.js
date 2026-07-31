export default function ProductThumb({
  product,
  emojiClassName = 'text-2xl',
  imgClassName = 'w-8 h-8 rounded-lg object-cover',
}) {
  if (product?.imageUrl) {
    return (
      <img
        src={product.imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={imgClassName}
      />
    )
  }
  return <span className={emojiClassName}>{product?.imageEmoji ?? '☕'}</span>
}
