import {
  Errors,
  ErrorValue,
  FormDataErrors,
  FormDataKeys,
  FormDataValues,
  Progress,
  UrlMethodPair,
  UseFormTransformCallback,
  UseFormUtils,
  UseFormWithPrecognitionArguments,
} from '@inertiajs/core'
import { cloneDeep, isEqual } from 'es-toolkit'
import { get, has, set } from 'es-toolkit/compat'
import {
  createValidator,
  NamedInputEvent,
  resolveName,
  toSimpleValidationErrors,
  ValidationConfig,
  Validator,
} from 'laravel-precognition'
import { signal, ref, effect, onMount, computed, Signal, ComputedSignal } from 'kiru'
import { config } from './config'

export type SetDataByObject<TForm> = (data: Partial<TForm>) => void
export type SetDataByMethod<TForm> = (data: (previousData: TForm) => TForm) => void
export type SetDataByKeyValuePair<TForm> = <K extends FormDataKeys<TForm>>(
  key: K,
  value: FormDataValues<TForm, K>,
) => void
export type SetDataAction<TForm extends Record<any, any>> = SetDataByObject<TForm> &
  SetDataByMethod<TForm> &
  SetDataByKeyValuePair<TForm>

type PrecognitionValidationConfig<TKeys> = ValidationConfig & {
  only?: TKeys[] | Iterable<TKeys> | ArrayLike<TKeys>
}

export interface FormStateProps<TForm extends object> {
  data: Signal<TForm>
  isDirty: ComputedSignal<boolean>
  errors: Signal<FormDataErrors<TForm>>
  hasErrors: ComputedSignal<boolean>
  processing: Signal<boolean>
  progress: Signal<Progress | null>
  wasSuccessful: Signal<boolean>
  recentlySuccessful: Signal<boolean>
  setData: SetDataAction<TForm>
  transform: (callback: UseFormTransformCallback<TForm>) => void
  setDefaults: {
    (): void
    <T extends FormDataKeys<TForm>>(field: T, value: FormDataValues<TForm, T>): void
    (fields: Partial<TForm>): void
  }
  reset: <K extends FormDataKeys<TForm>>(...fields: K[]) => void
  clearErrors: <K extends FormDataKeys<TForm>>(...fields: K[]) => void
  resetAndClearErrors: <K extends FormDataKeys<TForm>>(...fields: K[]) => void
  setError: {
    <K extends FormDataKeys<TForm>>(field: K, value: ErrorValue): void
    (errors: FormDataErrors<TForm>): void
  }
  withPrecognition: (...args: UseFormWithPrecognitionArguments) => FormStateWithPrecognition<TForm>
}

export interface FormStateValidationProps<TForm extends object> {
  invalid: <K extends FormDataKeys<TForm>>(field: K) => boolean
  setValidationTimeout: (duration: number) => FormStateWithPrecognition<TForm>
  touch: <K extends FormDataKeys<TForm>>(
    field: K | NamedInputEvent | Array<K>,
    ...fields: K[]
  ) => FormStateWithPrecognition<TForm>
  touched: <K extends FormDataKeys<TForm>>(field?: K) => boolean
  valid: <K extends FormDataKeys<TForm>>(field: K) => boolean
  validate: <K extends FormDataKeys<TForm>>(
    field?: K | NamedInputEvent | PrecognitionValidationConfig<K>,
    config?: PrecognitionValidationConfig<K>,
  ) => FormStateWithPrecognition<TForm>
  validateFiles: () => FormStateWithPrecognition<TForm>
  validating: Signal<boolean>
  validator: () => Validator
  withAllErrors: () => FormStateWithPrecognition<TForm>
  withoutFileValidation: () => FormStateWithPrecognition<TForm>
  setErrors: (errors: FormDataErrors<TForm>) => FormStateWithPrecognition<TForm>
  forgetError: <K extends FormDataKeys<TForm> | NamedInputEvent>(field: K) => FormStateWithPrecognition<TForm>
}

export type FormState<TForm extends object> = FormStateProps<TForm>
export type FormStateWithPrecognition<TForm extends object> = FormStateProps<TForm> & FormStateValidationProps<TForm>

export interface UseFormStateOptions<TForm extends object> {
  data: TForm | (() => TForm)
  precognitionEndpoint?: (() => UrlMethodPair) | null
  useDataState?: () => Signal<TForm>
  useErrorsState?: () => Signal<FormDataErrors<TForm>>
}

export interface UseFormStateReturn<TForm extends object> {
  form: FormState<TForm>
  defaults: Signal<TForm>
  transformRef: Kiru.RefObject<UseFormTransformCallback<TForm>>
  precognitionEndpointRef: Kiru.RefObject<(() => UrlMethodPair) | null>
  dataRef: Kiru.RefObject<TForm>
  isMounted: Kiru.RefObject<boolean>
  processing: Signal<boolean>
  progress: Signal<Progress | null>
  markAsSuccessful: () => void
  clearErrors: (...fields: string[]) => void
  setError: (fieldOrFields: FormDataKeys<TForm> | FormDataErrors<TForm>, maybeValue?: ErrorValue) => void
  defaultsCalledInOnSuccessRef: Kiru.RefObject<boolean>
  resetBeforeSubmit: () => void
  finishProcessing: () => void
  withAllErrors: { enabled: () => boolean; enable: () => void }
}

export default function useFormState<TForm extends object>(
  options: UseFormStateOptions<TForm>,
): UseFormStateReturn<TForm> {
  const { data: dataOption, useDataState, useErrorsState } = options

  const isDataFunction = typeof dataOption === 'function'
  const resolveData = () => (isDataFunction ? (dataOption as () => TForm)() : dataOption)

  const initialData = cloneDeep(resolveData())

  const isMounted = ref(false)
  const precognitionEndpointRef = ref(options.precognitionEndpoint ?? null)

  const defaults = signal(cloneDeep(initialData))

  const data = useDataState ? useDataState() : signal(cloneDeep(initialData))
  const errors = useErrorsState ? useErrorsState() : signal({} as FormDataErrors<TForm>)
  const processing = signal(false)
  const progress = signal<Progress | null>(null)
  const wasSuccessful = signal(false)
  const recentlySuccessful = signal(false)

  const recentlySuccessfulTimeoutId = ref<number | undefined>(undefined)
  const transformRef = ref<UseFormTransformCallback<TForm>>((data) => data)
  const defaultsCalledInOnSuccessRef = ref(false)

  const validatorRef = ref<Validator | null>(null)
  const validating = signal(false)
  const touchedFields = signal<string[]>([])
  const validFields = signal<string[]>([])
  const withAllErrorsRef = ref<boolean | null>(null)
  const withAllErrorsEnabled = () => withAllErrorsRef.current ?? config.get('form.withAllErrors')

  const dataRef = ref(data.value)

  effect(() => {
    dataRef.current = data.value
  })

  onMount(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  })

  const commitData = (next: TForm) => {
    dataRef.current = next
    data.value = next
  }

  const setDataFunction = (keyOrData: FormDataKeys<TForm> | Function | Partial<TForm>, maybeValue?: any) => {
    if (typeof keyOrData === 'string') {
      commitData(set(cloneDeep(dataRef.current), keyOrData, maybeValue))
    } else if (typeof keyOrData === 'function') {
      commitData(keyOrData(dataRef.current))
    } else {
      commitData(keyOrData as TForm)
    }
  }

  const setDefaultsFunction = (fieldOrFields?: FormDataKeys<TForm> | Partial<TForm>, maybeValue?: unknown) => {
    if (isDataFunction) {
      throw new Error('You cannot call `defaults()` when using a function to define your form data.')
    }

    defaultsCalledInOnSuccessRef.current = true

    let newDefaults = {} as TForm

    if (typeof fieldOrFields === 'undefined') {
      newDefaults = { ...dataRef.current }
      defaults.value = dataRef.current
    } else {
      newDefaults =
        typeof fieldOrFields === 'string'
          ? set(cloneDeep(defaults.value), fieldOrFields, maybeValue)
          : Object.assign(cloneDeep(defaults.value), fieldOrFields)
      defaults.value = newDefaults as TForm
    }

    validatorRef.current?.defaults(newDefaults as Record<string, unknown>)
  }

  const reset = (...fields: string[]) => {
    const resolvedData = isDataFunction ? cloneDeep(resolveData()) : defaults.value
    const clonedData = cloneDeep(resolvedData)

    if (fields.length === 0) {
      if (isDataFunction) {
        defaults.value = clonedData
      }
      commitData(clonedData)
    } else {
      if (isDataFunction) {
        const newDefaults = cloneDeep(defaults.value)
        ;(fields as Array<FormDataKeys<TForm>>)
          .filter((key) => has(clonedData, key))
          .forEach((key) => {
            set(newDefaults, key, get(clonedData, key))
          })
        defaults.value = newDefaults
      }

      const next = (fields as Array<FormDataKeys<TForm>>)
        .filter((key) => has(clonedData, key))
        .reduce(
          (carry, key) => {
            return set(carry, key, get(clonedData, key))
          },
          { ...dataRef.current } as TForm,
        )
      commitData(next)
    }

    validatorRef.current?.reset(...fields)
  }

  const setError = (fieldOrFields: FormDataKeys<TForm> | FormDataErrors<TForm>, maybeValue?: ErrorValue) => {
    const newErrors = {
      ...errors.value,
      ...(typeof fieldOrFields === 'string' ? { [fieldOrFields]: maybeValue } : fieldOrFields),
    }
    validatorRef.current?.setErrors(newErrors)
    errors.value = newErrors
  }

  const clearErrors = (...fields: string[]) => {
    const newErrors = Object.keys(errors.value).reduce(
      (carry, field) => ({
        ...carry,
        ...(fields.length > 0 && !fields.includes(field) ? { [field]: (errors.value as Errors)[field] } : {}),
      }),
      {},
    )

    if (validatorRef.current) {
      if (fields.length === 0) {
        validatorRef.current.setErrors({})
      } else {
        fields.forEach(validatorRef.current.forgetError)
      }
    }

    errors.value = newErrors as FormDataErrors<TForm>
  }

  const resetAndClearErrors = (...fields: string[]) => {
    reset(...fields)
    clearErrors(...fields)
  }

  const markAsSuccessful = () => {
    clearErrors()
    wasSuccessful.value = true
    recentlySuccessful.value = true

    recentlySuccessfulTimeoutId.current = window.setTimeout(() => {
      if (isMounted.current) {
        recentlySuccessful.value = false
      }
    }, config.get('form.recentlySuccessfulDuration'))
  }

  const resetBeforeSubmit = () => {
    wasSuccessful.value = false
    recentlySuccessful.value = false
    clearTimeout(recentlySuccessfulTimeoutId.current)
  }

  const finishProcessing = () => {
    processing.value = false
    progress.value = null
  }

  const transformFunction = (callback: UseFormTransformCallback<TForm>) => {
    transformRef.current = callback
  }

  const tap = <T>(value: T, callback: (value: T) => unknown): T => {
    callback(value)
    return value
  }

  const valid = <K extends FormDataKeys<TForm>>(field: K) => validFields.value.includes(field as string)
  const invalid = <K extends FormDataKeys<TForm>>(field: K) => field in errors.value
  const touched = <K extends FormDataKeys<TForm>>(field?: K) =>
    typeof field === 'string' ? touchedFields.value.includes(field as string) : touchedFields.value.length > 0

  const isDirty = computed(() => !isEqual(data.value, defaults.value))
  const hasErrors = computed(() => Object.keys(errors.value).length > 0)

  const form = {
    data,
    isDirty,
    errors,
    hasErrors,
    processing,
    progress,
    wasSuccessful,
    recentlySuccessful,
    setData: setDataFunction,
    transform: transformFunction,
    setDefaults: setDefaultsFunction,
    reset,
    setError,
    clearErrors,
    resetAndClearErrors,
  } as FormState<TForm>

  const validate = (field?: string | NamedInputEvent | ValidationConfig, config?: ValidationConfig) => {
    if (typeof field === 'object' && !('target' in field)) {
      config = field
      field = undefined
    }

    if (field === undefined) {
      validatorRef.current!.validate(config)
    } else {
      const fieldName = resolveName(field)
      const transformedData = transformRef.current(dataRef.current) as Record<string, unknown>
      validatorRef.current!.validate(fieldName, get(transformedData, fieldName), config)
    }

    return form
  }

  const withPrecognition = (...args: UseFormWithPrecognitionArguments): FormStateWithPrecognition<TForm> => {
    precognitionEndpointRef.current = UseFormUtils.createWayfinderCallback(...args)

    if (!validatorRef.current) {
      const validator = createValidator(
        (client) => {
          const { method, url } = precognitionEndpointRef.current!()
          const currentData = dataRef.current
          const transformedData = transformRef.current(currentData) as Record<string, unknown>
          return client[method](url, transformedData)
        },
        cloneDeep(defaults.value as Record<string, unknown>),
      )

      validatorRef.current = validator

      validator
        .on('validatingChanged', () => {
          validating.value = validator.validating()
        })
        .on('validatedChanged', () => {
          validFields.value = validator.valid()
        })
        .on('touchedChanged', () => {
          touchedFields.value = validator.touched()
        })
        .on('errorsChanged', () => {
          const validationErrors = withAllErrorsEnabled()
            ? validator.errors()
            : toSimpleValidationErrors(validator.errors())

          errors.value = validationErrors as FormDataErrors<TForm>
          validFields.value = validator.valid()
        })
    }

    const precognitiveForm = Object.assign(form, {
      validating,
      validator: () => validatorRef.current!,
      valid,
      invalid,
      touched,
      withoutFileValidation: () => tap(precognitiveForm, () => validatorRef.current?.withoutFileValidation()),
      touch: (
        field: FormDataKeys<TForm> | NamedInputEvent | Array<FormDataKeys<TForm>>,
        ...fields: FormDataKeys<TForm>[]
      ) => {
        if (Array.isArray(field)) {
          validatorRef.current?.touch(field)
        } else if (typeof field === 'string') {
          validatorRef.current?.touch([field, ...fields])
        } else {
          validatorRef.current?.touch(field)
        }

        return precognitiveForm
      },
      withAllErrors: () => tap(precognitiveForm, () => (withAllErrorsRef.current = true)),
      setValidationTimeout: (duration: number) =>
        tap(precognitiveForm, () => validatorRef.current?.setTimeout(duration)),
      validateFiles: () => tap(precognitiveForm, () => validatorRef.current?.validateFiles()),
      validate,
      setErrors: (errs: FormDataErrors<TForm>) => tap(precognitiveForm, () => form.setError(errs)),
      forgetError: (field: FormDataKeys<TForm> | NamedInputEvent) =>
        tap(precognitiveForm, () =>
          form.clearErrors(resolveName(field as string | NamedInputEvent) as FormDataKeys<TForm>),
        ),
    }) as FormStateWithPrecognition<TForm>

    return precognitiveForm
  }

  form.withPrecognition = withPrecognition

  if (precognitionEndpointRef.current) {
    form.withPrecognition(precognitionEndpointRef.current)
  }

  return {
    form,
    defaults,
    transformRef,
    precognitionEndpointRef,
    dataRef,
    isMounted,
    processing,
    progress,
    markAsSuccessful,
    clearErrors,
    setError,
    defaultsCalledInOnSuccessRef,
    resetBeforeSubmit,
    finishProcessing,
    withAllErrors: {
      enabled: withAllErrorsEnabled,
      enable: () => {
        withAllErrorsRef.current = true
      },
    },
  }
}
