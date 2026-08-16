package booking

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"
)

type availabilitySlot struct {
	Time     string `json:"time"`
	StartsAt string `json:"starts_at"`
	EndsAt   string `json:"ends_at"`
	StaffID  int64  `json:"staff_id"`
}

type slotResult struct {
	slots []availabilitySlot
	staff []EligibleStaff
	err   error
}

func (s *Service) BookingPage(ctx context.Context, branchID int64) (map[string]any, error) {
	if s.catalog == nil || branchID <= 0 {
		return nil, ErrInvalidTransition
	}
	return s.catalog.BookingPage(ctx, branchID)
}

func (s *Service) LookupAvailability(ctx context.Context, query AvailabilityQuery, includeSlots bool) (map[string]any, error) {
	if s.catalog == nil || s.provider == nil || query.BranchID <= 0 || len(query.ServiceIDs) == 0 {
		return nil, ErrInvalidTransition
	}
	if query.BookingType != "scheduled" && query.BookingType != "queue" {
		return nil, ErrInvalidTransition
	}
	if query.ParticipantCount == 0 {
		query.ParticipantCount = 1
	}
	if query.ParticipantCount < 1 || query.ParticipantCount > 5 {
		return nil, ErrInvalidTransition
	}
	snapshots, err := s.catalog.Snapshots(ctx, query.BranchID, query.ServiceIDs)
	if err != nil {
		return nil, err
	}
	providerID, err := commonProvider(snapshots)
	if err != nil {
		return nil, err
	}
	var duration int32
	var totalPrice int64
	for _, snapshot := range snapshots {
		if query.BookingType == "scheduled" && !snapshot.ScheduledEnabled || query.BookingType == "queue" && !snapshot.QueueEnabled {
			return nil, ErrInvalidTransition
		}
		duration += snapshot.Duration
		totalPrice += snapshot.PriceMinor
	}
	duration *= query.ParticipantCount
	totalPrice *= int64(query.ParticipantCount)
	result := map[string]any{
		"participant_count":  query.ParticipantCount,
		"total_duration":     duration,
		"estimated_duration": duration,
		"total_price_minor":  totalPrice,
		"total_price":        float64(totalPrice) / 100,
		"currency":           "IDR",
		"eligible_staff":     []EligibleStaff{},
		"available_slots":    []availabilitySlot{},
		"queue_estimation":   nil,
	}
	date := query.BookingDate
	if date == "" {
		date = time.Now().In(s.location).Format("2006-01-02")
	}
	day, err := time.ParseInLocation("2006-01-02", date, s.location)
	today, _ := time.ParseInLocation("2006-01-02", time.Now().In(s.location).Format("2006-01-02"), s.location)
	if err != nil || day.Before(today) {
		return nil, ErrInvalidTransition
	}
	if query.BookingType == "queue" {
		startsAt := time.Now().UTC()
		endsAt := startsAt.Add(time.Duration(duration) * time.Minute)
		staff, staffErr := s.provider.EligibleStaff(ctx, providerID, query.BranchID, query.ServiceIDs, startsAt, endsAt)
		if staffErr != nil {
			return nil, staffErr
		}
		result["eligible_staff"] = filterStaff(staff, query.StaffID)
		result["queue_estimation"] = map[string]any{"estimated_duration": duration}
		return result, nil
	}

	// Provider owns branch/staff working windows. Probe a bounded day in
	// parallel; its eligibility query removes times outside those windows.
	results := make(chan slotResult, 48)
	var group sync.WaitGroup
	for minute := 0; minute < 24*60; minute += 30 {
		startsAt := day.Add(time.Duration(minute) * time.Minute)
		if !startsAt.After(time.Now().In(s.location)) {
			continue
		}
		endsAt := startsAt.Add(time.Duration(duration) * time.Minute)
		group.Add(1)
		go func() {
			defer group.Done()
			staff, staffErr := s.provider.EligibleStaff(ctx, providerID, query.BranchID, query.ServiceIDs, startsAt.UTC(), endsAt.UTC())
			if staffErr != nil {
				results <- slotResult{err: staffErr}
				return
			}
			staff = filterStaff(staff, query.StaffID)
			value := slotResult{staff: staff}
			for _, candidate := range staff {
				available, availabilityErr := s.repository.Availability(ctx, candidate.ID, startsAt.UTC(), endsAt.UTC(), query.HeldBookingID)
				if availabilityErr != nil {
					results <- slotResult{err: availabilityErr}
					return
				}
				if available {
					value.slots = append(value.slots, availabilitySlot{Time: startsAt.Format("15:04"), StartsAt: startsAt.UTC().Format(time.RFC3339), EndsAt: endsAt.UTC().Format(time.RFC3339), StaffID: candidate.ID})
				}
			}
			results <- value
		}()
	}
	go func() {
		group.Wait()
		close(results)
	}()
	staffByID := map[int64]EligibleStaff{}
	slots := []availabilitySlot{}
	var firstErr error
	for item := range results {
		if item.err != nil {
			if firstErr == nil {
				firstErr = item.err
			}
			continue
		}
		for _, candidate := range item.staff {
			staffByID[candidate.ID] = candidate
		}
		slots = append(slots, item.slots...)
	}
	if firstErr != nil {
		return nil, fmt.Errorf("resolve booking availability: %w", firstErr)
	}
	staff := make([]EligibleStaff, 0, len(staffByID))
	for _, candidate := range staffByID {
		staff = append(staff, candidate)
	}
	sort.Slice(staff, func(i, j int) bool { return staff[i].ID < staff[j].ID })
	sort.Slice(slots, func(i, j int) bool {
		if slots[i].StartsAt == slots[j].StartsAt {
			return slots[i].StaffID < slots[j].StaffID
		}
		return slots[i].StartsAt < slots[j].StartsAt
	})
	result["eligible_staff"] = staff
	if includeSlots {
		result["available_slots"] = slots
	}
	return result, nil
}

func filterStaff(items []EligibleStaff, requested *int64) []EligibleStaff {
	if requested == nil {
		return items
	}
	for _, item := range items {
		if item.ID == *requested {
			return []EligibleStaff{item}
		}
	}
	return []EligibleStaff{}
}
