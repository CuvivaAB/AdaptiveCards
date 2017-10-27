/* ----------------------------------------------------------------------------
 * This file was automatically generated by SWIG (http://www.swig.org).
 * Version 3.0.12
 *
 * Do not make changes to this file unless you know what you are doing--modify
 * the SWIG interface file instead.
 * ----------------------------------------------------------------------------- */

package com.microsoft.adaptivecards.objectmodel;

public class Container extends BaseCardElement {
  private transient long swigCPtr;
  private transient boolean swigCMemOwnDerived;

  protected Container(long cPtr, boolean cMemoryOwn) {
    super(AdaptiveCardObjectModelJNI.Container_SWIGSmartPtrUpcast(cPtr), true);
    swigCMemOwnDerived = cMemoryOwn;
    swigCPtr = cPtr;
  }

  protected static long getCPtr(Container obj) {
    return (obj == null) ? 0 : obj.swigCPtr;
  }

  protected void finalize() {
    delete();
  }

  public synchronized void delete() {
    if (swigCPtr != 0) {
      if (swigCMemOwnDerived) {
        swigCMemOwnDerived = false;
        AdaptiveCardObjectModelJNI.delete_Container(swigCPtr);
      }
      swigCPtr = 0;
    }
    super.delete();
  }

  public Container() {
    this(AdaptiveCardObjectModelJNI.new_Container__SWIG_0(), true);
  }

  public Container(Spacing spacing, boolean separator, ContainerStyle style) {
    this(AdaptiveCardObjectModelJNI.new_Container__SWIG_1(spacing.swigValue(), separator, style.swigValue()), true);
  }

  public Container(Spacing spacing, boolean separator, ContainerStyle style, BaseCardElementVector items) {
    this(AdaptiveCardObjectModelJNI.new_Container__SWIG_2(spacing.swigValue(), separator, style.swigValue(), BaseCardElementVector.getCPtr(items), items), true);
  }

  public String Serialize() {
    return AdaptiveCardObjectModelJNI.Container_Serialize(swigCPtr, this);
  }

  public SWIGTYPE_p_Json__Value SerializeToJsonValue() {
    return new SWIGTYPE_p_Json__Value(AdaptiveCardObjectModelJNI.Container_SerializeToJsonValue(swigCPtr, this), true);
  }

  public BaseCardElementVector GetItems() {
    return new BaseCardElementVector(AdaptiveCardObjectModelJNI.Container_GetItems__SWIG_0(swigCPtr, this), false);
  }

  public ContainerStyle GetStyle() {
    return ContainerStyle.swigToEnum(AdaptiveCardObjectModelJNI.Container_GetStyle(swigCPtr, this));
  }

  public void SetStyle(ContainerStyle value) {
    AdaptiveCardObjectModelJNI.Container_SetStyle(swigCPtr, this, value.swigValue());
  }

  public BaseActionElement GetSelectAction() {
    long cPtr = AdaptiveCardObjectModelJNI.Container_GetSelectAction(swigCPtr, this);
    return (cPtr == 0) ? null : new BaseActionElement(cPtr, true);
  }

  public void SetSelectAction(BaseActionElement action) {
    AdaptiveCardObjectModelJNI.Container_SetSelectAction(swigCPtr, this, BaseActionElement.getCPtr(action), action);
  }

  public static Container dynamic_cast(BaseCardElement baseCardElement) {
    long cPtr = AdaptiveCardObjectModelJNI.Container_dynamic_cast(BaseCardElement.getCPtr(baseCardElement), baseCardElement);
    return (cPtr == 0) ? null : new Container(cPtr, true);
  }

}
