"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";

import { Button, Icon } from "@explore-and-earn/ui";
import type { GeoPoint } from "@explore-and-earn/contracts";

import {
  MapboxGeocodingError,
  searchMapboxLocations,
  type ListingLocationSuggestion,
} from "../../lib/mapboxGeocoding";
import styles from "./LocationPicker.module.css";

export interface LocationPickerProps {
  readonly value: string;
  readonly point: GeoPoint | null;
  readonly onChange: (value: string, point: GeoPoint | null) => void;
}

export function LocationPicker({ value, point, onChange }: LocationPickerProps) {
  const t = useTranslations("HostLocationPicker");
  const [suggestions, setSuggestions] = useState<
    ReadonlyArray<ListingLocationSuggestion>
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

  useEffect(
    () => () => {
      activeRequest.current?.abort();
    },
    [],
  );

  function editValue(nextValue: string) {
    activeRequest.current?.abort();
    setIsSearching(false);
    setSuggestions([]);
    setMessage(null);
    // A typed label is not proof that an earlier point still describes it.
    onChange(nextValue, null);
  }

  async function findLocations() {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setIsSearching(true);
    setMessage(null);
    setSuggestions([]);

    try {
      const results = await searchMapboxLocations(
        value,
        token,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setSuggestions(results);
      setMessage(
        results.length === 0
          ? t("noMatches")
          : null,
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessage(
        error instanceof MapboxGeocodingError
          ? t(error.code === "invalid_query" ? "invalidQuery" : "unavailable")
          : t("unavailable"),
      );
    } finally {
      if (!controller.signal.aborted) setIsSearching(false);
    }
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void findLocations();
  }

  function chooseLocation(suggestion: ListingLocationSuggestion) {
    activeRequest.current?.abort();
    setSuggestions([]);
    setMessage(null);
    setIsSearching(false);
    onChange(suggestion.label, suggestion.point);
  }

  function removePoint() {
    setSuggestions([]);
    setMessage(null);
    onChange(value, null);
  }

  return (
    <div className={styles.root}>
      <div className={styles.searchRow}>
        <input
          className={styles.input}
          id="listing-location"
          name="locationName"
          type="text"
          value={value}
          onChange={(event) => editValue(event.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder={t("placeholder")}
          maxLength={200}
          autoComplete="address-level2"
          aria-describedby="listing-location-help listing-location-status"
        />
        <Button
          variant="secondary"
          icon="action.search"
          onClick={() => void findLocations()}
          disabled={isSearching || value.trim().length === 0}
        >
          {isSearching ? t("finding") : t("findPin")}
        </Button>
      </div>

      <p className={styles.hint} id="listing-location-help">
        {t("help")}
      </p>

      {suggestions.length > 0 ? (
        <ul className={styles.suggestions} aria-label={t("matchesLabel")}>
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                className={styles.suggestion}
                type="button"
                onClick={() => chooseLocation(suggestion)}
              >
                <Icon name="mappin.location" size={18} aria-hidden />
                <span>{suggestion.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {point ? (
        <div className={styles.confirmed} id="listing-location-status" role="status">
          <Icon name="status.accepted" size={18} aria-hidden />
          <span>
            {t("confirmedPrefix")} <strong>{value}</strong>.
          </span>
          <button className={styles.remove} type="button" onClick={removePoint}>
            {t("removePin")}
          </button>
        </div>
      ) : (
        <p
          className={message ? styles.messageError : styles.message}
          id="listing-location-status"
          role={message ? "alert" : "status"}
          aria-live="polite"
        >
          {message ?? t("noPin")}
        </p>
      )}

      <p className={styles.attribution}>
        {t("attribution")}{" "}
        <a
          href="https://www.mapbox.com/about/maps/"
          target="_blank"
          rel="noreferrer"
        >
          Mapbox
        </a>
      </p>
    </div>
  );
}
