package catalog

import (
	"errors"
	"time"
)

var (
	ErrNotFound      = errors.New("catalog resource not found")
	ErrForbidden     = errors.New("catalog resource is outside actor scope")
	ErrConflict      = errors.New("catalog resource conflict")
	ErrValidation    = errors.New("catalog input is invalid")
	ErrInvalidCoupon = errors.New("coupon is not applicable")
)

type Coupon struct {
	Type       string
	ValueMinor int64
	Quantity   *int64
	UsedCount  int64
	StartsAt   time.Time
	EndsAt     time.Time
	Active     bool
}

func DiscountMinor(amountMinor int64, coupon Coupon, at time.Time) (int64, error) {
	day := at.UTC().Truncate(24 * time.Hour)
	if amountMinor < 0 || !coupon.Active || day.Before(coupon.StartsAt.UTC().Truncate(24*time.Hour)) || day.After(coupon.EndsAt.UTC().Truncate(24*time.Hour)) || coupon.Quantity != nil && coupon.UsedCount >= *coupon.Quantity {
		return 0, ErrInvalidCoupon
	}
	var discount int64
	switch coupon.Type {
	case "fixed":
		discount = coupon.ValueMinor
	case "percentage":
		if coupon.ValueMinor < 0 || coupon.ValueMinor > 10_000 {
			return 0, ErrInvalidCoupon
		}
		discount = amountMinor * coupon.ValueMinor / 10_000
	default:
		return 0, ErrInvalidCoupon
	}
	if discount > amountMinor {
		discount = amountMinor
	}
	return discount, nil
}
